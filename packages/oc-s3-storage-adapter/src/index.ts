import async from 'async';
import AWS from 'aws-sdk';
import Cache from 'nice-cache';
import format from 'stringformat';
import fs from 'fs-extra';
import nodeDir from 'node-dir';
import _ from 'lodash';
import { fromCallback } from 'universalify';

import {
  StorageAdapter,
  getFileInfo,
  getNextYear,
  strings
} from 'oc-storage-adapters-utils';

import type { Agent as httpAgent } from 'http';
import type { Agent as httpsAgent } from 'https';

type RequireAllOrNone<ObjectType, KeysType extends keyof ObjectType = never> = (
  | Required<Pick<ObjectType, KeysType>> // Require all of the given keys.
  | Partial<Record<KeysType, never>> // Require none of the given keys.
) &
  Omit<ObjectType, KeysType>; // The rest of the keys.

export type S3Config = RequireAllOrNone<
  {
    bucket: string;
    region: string;
    key?: string;
    secret?: string;
    path: string;
    sslEnabled?: boolean;
    s3ForcePathStyle?: boolean;
    signatureVersion?: string;
    timeout?: number;
    agentProxy?: httpAgent | httpsAgent;
    endpoint?: string;
    debug?: boolean;
    verbosity?: boolean;
    refreshInterval?: number;
  },
  'key' | 'secret'
>;

export default function s3Adapter(conf: S3Config): StorageAdapter {
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
    : (AWS.Config as any).signatureVersion;
  const httpOptions: any = { timeout: conf.timeout || 10000 };
  if (conf.agentProxy) {
    httpOptions.agent = conf.agentProxy;
  }

  // Setup AWS config
  const awsConfig = new AWS.Config({
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
    const endpoint = new AWS.Endpoint(conf.endpoint);
    awsConfig.update({
      endpoint
    } as any);
  }

  // Print debug info
  if (conf.debug === true) {
    awsConfig.update({
      logger: process.stdout
    } as any);
  }

  const cache = new Cache({
    verbose: !!conf.verbosity,
    refreshInterval: conf.refreshInterval
  });

  const getClient = () => new AWS.S3(awsConfig);

  const getConfig = () => getClient();

  const getFile = (filePath: string, force: boolean, callback: any) => {
    if (_.isFunction(force)) {
      callback = force;
      force = false;
    }

    const getFromAws = (cb: any) => {
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

          cb(null, data.Body!.toString());
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

    getFromAws((err: Error | null, result: any) => {
      if (err) {
        return callback(err);
      }
      cache.set('s3-file', filePath, result);
      cache.sub('s3-file', filePath, getFromAws);
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

        if (data.CommonPrefixes!.length === 0) {
          return callback({
            code: strings.errors.STORAGE.DIR_NOT_FOUND_CODE,
            msg: format(strings.errors.STORAGE.DIR_NOT_FOUND, dir)
          });
        }

        const result = _.map(data.CommonPrefixes, commonPrefix =>
          commonPrefix.Prefix!.substr(
            normalisedPath.length,
            commonPrefix.Prefix!.length - normalisedPath.length - 1
          )
        );

        callback(null, result);
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
      (obj as any).ContentType = fileInfo.mimeType;
    }

    if (fileInfo.gzip) {
      (obj as any).ContentEncoding = 'gzip';
    }

    const upload = getClient().upload(obj);
    upload.send(callback);
  };

  const putFile = (
    filePath: string,
    fileName: string,
    isPrivate: boolean,
    callback: any
  ) => {
    try {
      const stream = fs.createReadStream(filePath);
      return putFileContent(stream, fileName, isPrivate, callback);
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
    adapterType: 's3',
    isValid,
    getConfig
  } as any;
}

module.exports = s3Adapter;
