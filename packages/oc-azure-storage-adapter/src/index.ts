import async from 'async';
import azure from 'azure-storage';
import Cache from 'nice-cache';
import format from 'stringformat';
import fs from 'fs-extra';
import nodeDir from 'node-dir';
import _ from 'lodash';
import stream from 'stream';
import { fromCallback } from 'universalify';

import {
  getFileInfo,
  strings,
  StorageAdapter
} from 'oc-storage-adapters-utils';

export interface AzureConfig {
  publicContainerName: string;
  privateContainerName: string;
  accountName: string;
  accountKey: string;
  path: string;
  verbosity?: boolean;
  refreshInterval?: number;
}

export default function azureAdapter(conf: AzureConfig): StorageAdapter {
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

  const getFile = (filePath: string, force: boolean, callback: any) => {
    if (_.isFunction(force)) {
      callback = force;
      force = false;
    }

    const getFromAzure = (cb: any) => {
      getClient().getBlobToText(
        conf.privateContainerName,
        filePath,
        (err, fileContent) => {
          if (err) {
            if ((err as any).statusCode === 404) {
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

    getFromAzure((err: Error | null, result: any) => {
      if (err) {
        return callback(err);
      }
      cache.set('azure-file', filePath, result);
      cache.sub('azure-file', filePath, getFromAzure);
      callback(null, result);
    });
  };

  const getJson = (filePath: string, force: boolean, callback: any) => {
    if (_.isFunction(force)) {
      callback = force;
      force = false;
    }

    getFile(filePath, force, (err: Error | null, file: string) => {
      if (err) {
        return callback(err);
      }

      let parsed = null;
      try {
        parsed = JSON.parse(file);
      } catch (er) {
        return callback({
          code: strings.errors.STORAGE.FILE_NOT_VALID_CODE,
          msg: format(strings.errors.STORAGE.FILE_NOT_VALID, filePath)
        });
      }
      callback(null, parsed);
    });
  };

  const getUrl = (componentName: string, version: string, fileName: string) =>
    `${conf.path}${componentName}/${version}/${fileName}`;

  const listSubDirectories = (dir: string, callback: any) => {
    const normalisedPath =
      dir.lastIndexOf('/') === dir.length - 1 && dir.length > 0
        ? dir
        : `${dir}/`;

    const listBlobsWithPrefix = (
      azureClient: azure.BlobService,
      containerName: string,
      prefix: string,
      continuationToken: azure.common.ContinuationToken,
      callback: any
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
            return callback(null, allEntries);
          }

          listBlobsWithPrefix(
            azureClient,
            containerName,
            prefix,
            result.continuationToken,
            (err: Error | null, entryNames: string[]) => {
              if (err) {
                return callback(err);
              }

              allEntries = allEntries.concat(entryNames);
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
      null as unknown as azure.common.ContinuationToken,
      (err: Error | null, res: string[]) => {
        if (err) return callback(err);
        callback(null, _.uniq(res));
      }
    );
  };

  const putDir = (dirInput: string, dirOutput: string, callback: any) => {
    nodeDir.paths(dirInput, (err, paths) => {
      async.each(
        paths.files,
        (file, cb) => {
          const relativeFile = file.substr(dirInput.length),
            url = (dirOutput + relativeFile).replace(/\\/g, '/');

          const serverPattern = /(\\|\/)server\.js/;
          const dotFilePattern = /(\\|\/)\..+/;
          const privateFilePatterns = [serverPattern, dotFilePattern];
          putFile(
            file,
            url,
            privateFilePatterns.some(r => r.test(relativeFile)),
            cb
          );
        },
        callback
      );
    });
  };

  const putFileContent = (
    fileContent: string | fs.ReadStream,
    fileName: string,
    isPrivate: boolean,
    callback: any
  ) => {
    try {
      const fileInfo = getFileInfo(fileName);
      const contentSettings: azure.BlobService.CreateBlockBlobRequestOptions['contentSettings'] =
        {
          cacheControl: 'public, max-age=31556926'
        };
      if (fileInfo.mimeType) {
        contentSettings.contentType = fileInfo.mimeType;
      }

      if (fileInfo.gzip) {
        contentSettings.contentEncoding = 'gzip';
      }

      const uploadToAzureContainer = (
        rereadable: boolean,
        containerName: string,
        cb: any
      ) => {
        try {
          if (fileContent instanceof stream.Stream) {
            return fileContent.pipe(
              getClient().createWriteStreamToBlockBlob(
                containerName,
                fileName,
                { contentSettings: contentSettings },
                (err, res) => {
                  if (rereadable) {
                    // I need  a fresh read stream and this is the only thing I came up with
                    // very ugly and has poor performance, but works
                    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    fileContent = getClient().createReadStream(
                      containerName,
                      fileName
                    );
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
        } catch (err) {
          return cb(err);
        }
      };

      const makeReReadable = !isPrivate;
      uploadToAzureContainer(
        makeReReadable,
        conf.privateContainerName,
        (err: Error | null, result: any) => {
          if (err) {
            return callback(err);
          }

          if (!isPrivate) {
            return uploadToAzureContainer(
              false,
              conf.publicContainerName,
              callback
            );
          }

          return callback(null, result);
        }
      );
    } catch (err) {
      return callback(err);
    }
  };

  const putFile = (
    filePath: string,
    fileName: string,
    isPrivate: boolean,
    callback: any
  ) => {
    try {
      const stream = fs.createReadStream(filePath);
      putFileContent(stream, fileName, isPrivate, callback);
    } catch (e) {
      return callback(e);
    }
  };

  return {
    getFile: fromCallback(getFile),
    getJson: fromCallback(getJson),
    getUrl,
    listSubDirectories: fromCallback(listSubDirectories),
    maxConcurrentRequests: 20,
    putDir: fromCallback(putDir),
    putFile: fromCallback(putFile),
    putFileContent: fromCallback(putFileContent),
    adapterType: 'azure-blob-storage',
    isValid
  } as any;
}

module.exports = azureAdapter;
