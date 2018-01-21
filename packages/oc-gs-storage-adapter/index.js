'use strict';

const async = require('async');
const Cache = require('nice-cache');
const format = require('stringformat');
const fs = require('fs-extra');
const nodeDir = require('node-dir');
const _ = require('lodash');
const Storage = require('@google-cloud/storage');

const {
  getFileInfo,
  getNextYear,
  strings
} = require('oc-storage-adapters-utils');

module.exports = function(conf) {
  const isValid = () => {
    if (!conf.bucket || !conf.projectId || !conf.path) {
      return false;
    }
    return true;
  };
  const getClient = () => {
    const client = Storage({
      projectId: conf.projectId
    });
    return client;
  };
  const bucketName = conf.bucket;
  const cache = new Cache({
    verbose: !!conf.verbosity,
    refreshInterval: conf.refreshInterval
  });

  const getFile = (filePath, force, callback) => {
    if (_.isFunction(force)) {
      callback = force;
      force = false;
    }

    const getFromGs = cb => {
      getClient()
        .bucket(bucketName)
        .file(filePath)
        .download()
        .then(data => {
          cb(null, data.toString());
        })
        .catch(err =>
          callback(
            err.code === 404
              ? {
                code: strings.errors.STORAGE.FILE_NOT_FOUND_CODE,
                msg: format(strings.errors.STORAGE.FILE_NOT_FOUND, filePath)
              }
              : err
          )
        );
    };

    if (force) {
      return getFromGs(callback);
    }

    const cached = cache.get('gs-file', filePath);

    if (cached) {
      return callback(null, cached);
    }

    getFromGs((err, result) => {
      if (err) {
        return callback({ code: err.code, msg: err.message });
      }
      cache.set('gs-file', filePath, result);
      cache.sub('gs-file', filePath, getFromGs);
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
        : dir + '/';
    const options = {
      prefix: normalisedPath
    };
    getClient()
      .bucket(bucketName)
      .getFiles(options)
      .then(results => {
        const files = results[0];
        if (files.length === 0) {
          throw 'no files';
        }

        const result = files
          //remove prefix
          .map(file => file.name.replace(normalisedPath, ''))
          // only get files that aren't in root directory
          .filter(file => file.split('/').length > 1)
          //get directory names
          .map(file => file.split('/')[0])
          // reduce to unique directories
          .filter((item, i, ar) => ar.indexOf(item) === i);
        callback(null, result);
      })
      .catch(err =>
        callback({
          code: strings.errors.STORAGE.DIR_NOT_FOUND_CODE,
          msg: format(strings.errors.STORAGE.DIR_NOT_FOUND, dir)
        })
      );
  };

  const putDir = (dirInput, dirOutput, callback) => {
    nodeDir.paths(dirInput, (err, paths) => {
      async.each(
        paths.files,
        (file, cb) => {
          const relativeFile = file.substr(dirInput.length);
          const url = (dirOutput + relativeFile).replace(/\\/g, '/');
          putFile(file, url, relativeFile === '/server.js', cb);
        },
        callback
      );
    });
  };

  const putFileContent = (fileContent, fileName, isPrivate, callback) => {
    const tmp = require('tmp');

    const tmpobj = tmp.fileSync();

    fs.writeFileSync(tmpobj.name, fileContent);
    const cleanup = (v1, v2) => {
      tmpobj.removeCallback();
      callback(v1, v2);
    };
    putFile(tmpobj.name, fileName, isPrivate, cleanup);
  };

  const putFile = (filePath, fileName, isPrivate, callback) => {
    const fileInfo = getFileInfo(fileName);
    const obj = {
      ACL: isPrivate ? 'authenticated-read' : 'public-read',
      ContentType: fileInfo.mimeType,
      Bucket: bucketName,
      Key: fileName
    };

    if (fileInfo.gzip) {
      obj.ContentEncoding = 'gzip';
    }
    getClient()
      .bucket(bucketName)
      .upload(filePath, { destination: fileName })
      .then(() => {
        if (obj.ACL === 'public-read') {
          getClient()
            .bucket(bucketName)
            .file(fileName)
            .makePublic()
            .then(() => callback(null, obj))
            .catch(err => callback({ code: err.code, msg: err.message }, obj));
        } else {
          callback(null, obj);
        }
      })
      .catch(err => callback({ code: err.code, msg: err.message }, obj));
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
    adapterType: 'gs',
    isValid
  };
};
