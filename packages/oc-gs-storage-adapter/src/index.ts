import async from 'async';
import Cache from 'nice-cache';
import format from 'stringformat';
import fs from 'fs-extra';
import nodeDir from 'node-dir';
import _ from 'lodash';
import { Storage, UploadOptions } from '@google-cloud/storage';
import tmp from 'tmp';
import { fromCallback } from 'universalify';
import {
  getFileInfo,
  StorageAdapter,
  strings
} from 'oc-storage-adapters-utils';

export interface GsConfig {
  bucket: string;
  projectId: string;
  path: string;
  maxAge?: boolean;
  verbosity?: boolean;
  refreshInterval?: number;
}

export default function gsAdapter(conf: GsConfig): StorageAdapter {
  const isValid = () => {
    if (!conf.bucket || !conf.projectId || !conf.path) {
      return false;
    }
    return true;
  };

  let client: Storage | undefined = undefined;

  const getClient = () => {
    if (!client) {
      client = new Storage({
        projectId: conf.projectId
      });
    }
    return client;
  };

  const bucketName = conf.bucket;
  const cache = new Cache({
    verbose: !!conf.verbosity,
    refreshInterval: conf.refreshInterval
  });

  const getFile = (filePath: string, force: boolean, callback: any) => {
    if (_.isFunction(force)) {
      callback = force;
      force = false;
    }

    const getFromGs = (cb: any) => {
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

    getFromGs((err: Error | null, result: any) => {
      if (err) {
        return callback({ code: (err as any).code, msg: err.message });
      }
      cache.set('gs-file', filePath, result);
      cache.sub('gs-file', filePath, getFromGs);
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

  const getUrl = (componentName: string, version: string, fileName: string) =>
    `${conf.path}${componentName}/${version}/${fileName}`;

  const listSubDirectories = (dir: string, callback: any) => {
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

  const putDir = (dirInput: string, dirOutput: string, callback: any) => {
    nodeDir.paths(dirInput, (err, paths) => {
      if (err) {
        return callback(err, undefined);
      }
      async.each(
        paths.files,
        (file, cb) => {
          const relativeFile = file.substr(dirInput.length);
          const url = (dirOutput + relativeFile).replace(/\\/g, '/');
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
    fileContent: string,
    fileName: string,
    isPrivate: boolean,
    callback: any
  ) => {
    const tmpobj = tmp.fileSync();

    fs.writeFileSync(tmpobj.name, fileContent);
    const cleanup = (v1: any, v2: any) => {
      tmpobj.removeCallback();
      callback(v1, v2);
    };
    putFile(tmpobj.name, fileName, isPrivate, cleanup);
  };

  const putFile = (
    filePath: string,
    fileName: string,
    isPrivate: boolean,
    callback: any
  ) => {
    const fileInfo = getFileInfo(fileName);
    const obj: any = {
      ACL: isPrivate ? 'authenticated-read' : 'public-read',
      ContentType: fileInfo.mimeType,
      Bucket: bucketName,
      Key: fileName
    };

    if (fileInfo.gzip) {
      obj.ContentEncoding = 'gzip';
    }

    const options: UploadOptions = {
      destination: fileName,
      gzip: fileInfo.gzip
    };

    if (!isPrivate) {
      const maxAge = conf.maxAge || 3600;
      options.metadata = {
        cacheControl: `public, max-age=${maxAge}`
      };
    }

    getClient()
      .bucket(bucketName)
      .upload(filePath, options)
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
    getFile: fromCallback(getFile),
    getJson: fromCallback(getJson),
    getUrl,
    listSubDirectories: fromCallback(listSubDirectories),
    maxConcurrentRequests: 20,
    putDir: fromCallback(putDir),
    putFile: fromCallback(putFile),
    putFileContent: fromCallback(putFileContent),
    adapterType: 'gs',
    isValid
  } as any;
}

module.exports = gsAdapter;
