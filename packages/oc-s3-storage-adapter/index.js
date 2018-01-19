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

  var configuration = {
    verbosity: 0,
    baseUrl: 'http://localhost',
    port: 3333,
    tempDir: './temp/',
    refreshInterval: 600,
    pollingInterval: 5,
    storage: {
      options: {
        key: 'C8EA-NCOWKILUYLITIQE',
        secret: 'hc9szUABSnO1EezHoCiuYh1xpqp0JwP6SYDdBA==',
        bucket: 'foo', // Specified bucket will be used as prefix of the hostname, ie bucket.example.com. Omit for RiakCS
        region: 'us-east-1',
        componentsDir: '/store/',
        signatureVersion: 'v2', // Use v2 for RiakCS
        sslEnabled: false,
        path: '//foo.localhost:8080/foo',
        s3ForcePathStyle: true,
        endpoint: {
          protocol: 'http',
          hostname: 'localhost',
          port: '8080',
          href: 'http://localhost:8080/'
        }
      }
    },
    env: { name: 'production' }
  };

  // Defaults
  const bucket = conf.bucket ? conf.bucket : '';
  const sslEnabled = conf.sslEnabled === false ? { sslEnabled: false } : {};
  const s3ForcePathStyle = conf.s3ForcePathStyle
    ? { s3ForcePathStyle: true }
    : { s3ForcePathStyle: false };
  const signatureVersion = conf.signatureVersion
    ? { signatureVersion: conf.signatureVersion }
    : {};
  const httpOptions = { timeout: conf.timeout || 10000 };
  if (conf.agentProxy) {
    httpOptions.agent = conf.agentProxy;
  }

  // Setup AWS config
  let awsConfig = new AWS.Config({
    accessKeyId: conf.key,
    secretAccessKey: conf.secret,
    ...signatureVersion,
    ...sslEnabled,
    ...s3ForcePathStyle,
    ...httpOptions,
    logger: process.stdout
  });

  // Setup endpoint
  if (conf.endpoint) {
    let awsEndpoint = new AWS.Endpoint(conf.endpoint.hostname);
    awsEndpoint.port = conf.endpoint.port;
    awsEndpoint.protocol = conf.endpoint.protocol;
    awsEndpoint.path = conf.endpoint.path;
    awsConfig.update({
      endpoint: awsEndpoint
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
    console.log('listSubDirectories', dir);
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

          putFile(file, url, relativeFile === '/server.js', cb);
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
    isValid
  };
};
