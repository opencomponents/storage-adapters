'use strict';

const async = require('async');
const AWS = require('aws-sdk');
const Cache = require('nice-cache');
const format = require('stringformat');
const fs = require('fs-extra');
const nodeDir = require('node-dir');
const _ = require('lodash');

const {
  getFileInfo,
  getNextYear,
  strings
} = require('oc-storage-adapters-utils');

module.exports = function(conf) {
  const isValid = () => {
    if (
      !conf.bucket ||
      !conf.region ||
      (conf.key && !conf.secret) ||
      (!conf.key && conf.secret)
    ) {
      return false;
    }
    return true;
  };

  // Defaults
  const accessKeyId = conf.key;
  const secretAccessKey = conf.secret;
  const region = conf.region;
  const bucket = conf.bucket ? conf.bucket : '';
  const sslEnabled = conf.sslEnabled === false ? false : true;
  const s3ForcePathStyle = conf.s3ForcePathStyle ? true : false;
  const signatureVersion = conf.signatureVersion
    ? conf.signatureVersion
    : AWS.Config.signatureVersion;
  const httpOptions = { timeout: conf.timeout || 10000 };
  if (conf.agentProxy) {
    httpOptions.agent = conf.agentProxy;
  }

  // Setup AWS config
  let awsConfig = new AWS.Config({
    accessKeyId,
    secretAccessKey,
    region,
    signatureVersion,
    sslEnabled,
    s3ForcePathStyle,
    httpOptions
  });

  // Setup endpoint
  if (conf.endpoint) {
    let endpoint = new AWS.Endpoint(conf.endpoint);
    awsConfig.update({
      endpoint
    });
  }

  // Print debug info
  if (conf.debug === true) {
    awsConfig.update({
      logger: process.stdout
    });
  }

  const cache = new Cache({
    verbose: !!conf.verbosity,
    refreshInterval: conf.refreshInterval
  });

  const getClient = () => new AWS.S3(awsConfig);

  const getConfig = () => getClient();

  const getFile = (filePath, force, callback) => {
    if (_.isFunction(force)) {
      callback = force;
      force = false;
    }

    const getFromAws = cb => {
      getClient().getObject(
        {
          Bucket: bucket,
          Key: filePath
        },
        (err, data) => {
          if (err) {
            return callback(
              err.code === 'NoSuchKey'
                ? {
                  code: strings.errors.STORAGE.FILE_NOT_FOUND_CODE,
                  msg: format(strings.errors.STORAGE.FILE_NOT_FOUND, filePath)
                }
                : err
            );
          }

          cb(null, data.Body.toString());
        }
      );
    };

    if (force) {
      return getFromAws(callback);
    }

    const cached = cache.get('s3-file', filePath);

    if (cached) {
      return callback(null, cached);
    }

    getFromAws((err, result) => {
      if (err) {
        return callback(err);
      }
      cache.set('s3-file', filePath, result);
      cache.sub('s3-file', filePath, getFromAws);
      callback(null, result);
    });
  };

  const getJson = (filePath, force, callback) => {
    if (_.isFunction(force)) {
      callback = force;
      force = false;
    }

    getFile(filePath, force, (err, file) => {
      if (err) {
        return callback(err);
      }

      try {
        callback(null, JSON.parse(file));
      } catch (er) {
        return callback({
          code: strings.errors.STORAGE.FILE_NOT_VALID_CODE,
          msg: format(strings.errors.STORAGE.FILE_NOT_VALID, filePath)
        });
      }
    });
  };

  const getUrl = (componentName, version, fileName) =>
    `${conf.path}${componentName}/${version}/${fileName}`;

  const listSubDirectories = (dir, callback) => {
    const normalisedPath =
      dir.lastIndexOf('/') === dir.length - 1 && dir.length > 0
        ? dir
        : `${dir}/`;

    getClient().listObjects(
      {
        Bucket: bucket,
        Prefix: normalisedPath,
        Delimiter: '/'
      },
      (err, data) => {
        if (err) {
          return callback(err);
        }

        if (data.CommonPrefixes.length === 0) {
          return callback({
            code: strings.errors.STORAGE.DIR_NOT_FOUND_CODE,
            msg: format(strings.errors.STORAGE.DIR_NOT_FOUND, dir)
          });
        }

        const result = _.map(data.CommonPrefixes, commonPrefix =>
          commonPrefix.Prefix.substr(
            normalisedPath.length,
            commonPrefix.Prefix.length - normalisedPath.length - 1
          )
        );

        callback(null, result);
      }
    );
  };

  const putDir = (dirInput, dirOutput, callback) => {
    nodeDir.paths(dirInput, (err, paths) => {
      async.each(
        paths.files,
        (file, cb) => {
          const relativeFile = file.substr(dirInput.length),
            url = (dirOutput + relativeFile).replace(/\\/g, '/');

          const serverJsNames = ['/server.js', '\\server.js'];
          putFile(file, url, serverJsNames.includes(relativeFile), cb);
        },
        callback
      );
    });
  };

  const putFileContent = (fileContent, fileName, isPrivate, callback) => {
    const fileInfo = getFileInfo(fileName);
    const obj = {
      Bucket: bucket,
      Key: fileName,
      Body: fileContent,
      ACL: isPrivate ? 'authenticated-read' : 'public-read',
      ServerSideEncryption: 'AES256',
      Expires: getNextYear()
    };

    if (fileInfo.mimeType) {
      obj.ContentType = fileInfo.mimeType;
    }

    if (fileInfo.gzip) {
      obj.ContentEncoding = 'gzip';
    }

    const upload = getClient().upload(obj);
    upload.send(callback);
  };

  const putFile = (filePath, fileName, isPrivate, callback) => {
    try {
      const stream = fs.createReadStream(filePath);
      return putFileContent(stream, fileName, isPrivate, callback);
    } catch (e) {
      return callback(e);
    }
  };

  return {
    getFile,
    getJson,
    getUrl,
    listSubDirectories,
    maxConcurrentRequests: 20,
    putDir,
    putFile,
    putFileContent,
    adapterType: 's3',
    isValid,
    getConfig
  };
};
