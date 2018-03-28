'use strict';

const async = require('async');
const azure = require('azure-storage');
const Cache = require('nice-cache');
const format = require('stringformat');
const fs = require('fs-extra');
const nodeDir = require('node-dir');
const _ = require('lodash');
const stream = require('stream');

const {
  getFileInfo,
  getNextYear,
  strings
} = require('oc-storage-adapters-utils');

module.exports = function(conf) {
  const isValid = () => {
    if (
      !conf.publicContainerName ||
      !conf.privateContainerName ||
      (conf.accountName && !conf.accountKey) ||
      (!conf.accountName && conf.accountKey)
    ) {
      return false;
    }
    return true;
  };

  const cache = new Cache({
    verbose: !!conf.verbosity,
    refreshInterval: conf.refreshInterval
  });

  const getClient = () =>
    azure.createBlobService(conf.accountName, conf.accountKey);

  const getFile = (filePath, force, callback) => {
    if (_.isFunction(force)) {
      callback = force;
      force = false;
    }

    const getFromAzure = cb => {
      getClient().getBlobToText(
        conf.privateContainerName,
        filePath,
        (err, fileContent) => {
          if (err) {
            if (err.statusCode === 404) {
              return cb({
                code: strings.errors.STORAGE.FILE_NOT_FOUND_CODE,
                msg: format(strings.errors.STORAGE.FILE_NOT_FOUND, filePath)
              });
            }

            return cb(err);
          }

          cb(null, fileContent);
        }
      );
    };

    if (force) {
      return getFromAzure(callback);
    }

    const cached = cache.get('azure-file', filePath);

    if (cached) {
      return callback(null, cached);
    }

    getFromAzure((err, result) => {
      if (err) {
        return callback(err);
      }
      cache.set('azure-file', filePath, result);
      cache.sub('azure-file', filePath, getFromAzure);
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

    const listBlobsWithPrefix = (
      azureClient,
      containerName,
      prefix,
      continuationToken,
      callback
    ) => {
      azureClient.listBlobsSegmentedWithPrefix(
        containerName,
        normalisedPath,
        continuationToken,
        (err, result) => {
          if (err) {
            return callback(err);
          }

          if (!continuationToken && result.entries.length === 0) {
            return callback({
              code: strings.errors.STORAGE.DIR_NOT_FOUND_CODE,
              msg: format(strings.errors.STORAGE.DIR_NOT_FOUND, dir)
            });
          }

          let allEntries = result.entries
            .map(entry => {
              const prefixLessName = entry.name.replace(prefix, '');
              const indexOfLastSlash = prefixLessName.lastIndexOf('/');
              if (indexOfLastSlash === -1) {
                return null;
              }

              const filenamelessPath = prefixLessName.substr(
                0,
                indexOfLastSlash
              );
              const indexOfFirstSlash = filenamelessPath.indexOf('/');
              if (indexOfFirstSlash === -1) {
                return filenamelessPath;
              }

              return filenamelessPath.substr(0, indexOfFirstSlash);
            })
            .filter(entry => entry != null && entry.length > 0);
          if (!result.continuationToken) {
            // TODO: deduplicate
            return callback(null, allEntries);
          }

          listBlobsWithPrefix(
            azureClient,
            containerName,
            prefix,
            result.continuationToken,
            (err, entryNames) => {
              if (err) {
                return callback(err);
              }

              allEntries = allEntries.concat(entryNames);
              // TODO: deduplicate
              callback(null, allEntries);
            }
          );
        }
      );
    };

    listBlobsWithPrefix(
      getClient(),
      conf.privateContainerName,
      normalisedPath,
      null,
      callback
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
    const contentSettings = {};
    if (fileInfo.mimeType) {
      contentSettings.contentType = fileInfo.mimeType;
    }

    if (fileInfo.gzip) {
      contentSettings.contentEncoding = 'gzip';
    }

    const uploadToAzureContainer = (rereadable, containerName, cb) => {
      if (fileContent instanceof stream.Stream) {
        return fileContent.pipe(
          getClient().createWriteStreamToBlockBlob(
            containerName,
            fileName,
            { contentSettings: contentSettings },
            (err, res) => {
              if(rereadable) {
                // I need  a fresh read stream and this is the only thing I came up with
                // very ugly and has poor performance, but works
                fileContent = getClient().createReadStream(containerName, fileName);
              }

              cb(err, res);
            }
          )
        );
      }

      getClient().createBlockBlobFromText(
        containerName,
        fileName,
        fileContent,
        { contentSettings: contentSettings },
        cb
      );
    };

    const makeReReadable = !isPrivate;
    uploadToAzureContainer(makeReReadable, conf.privateContainerName, (err, result) => {
      if (err) {
        return callback(err);
      }

      if (!isPrivate) {
        return uploadToAzureContainer(false, conf.publicContainerName, callback);
      }

      return callback(null, result);
    });
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
    adapterType: 'azure-blob-storage',
    isValid
  };
};
