import { S3 } from '@aws-sdk/client-s3';
import {
  NodeHttpHandler,
  NodeHttpHandlerOptions
} from '@aws-sdk/node-http-handler';
import Cache from 'nice-cache';
import fs from 'fs-extra';
import _ from 'lodash';

import {
  getFileInfo,
  getNextYear,
  strings,
  StorageAdapter,
  StorageAdapterBaseConfig
} from 'oc-storage-adapters-utils';

import type { Agent as httpAgent } from 'http';
import type { Agent as httpsAgent } from 'https';

type RequireAllOrNone<ObjectType, KeysType extends keyof ObjectType = never> = (
  | Required<Pick<ObjectType, KeysType>> // Require all of the given keys.
  | Partial<Record<KeysType, never>>
) & // Require none of the given keys.
  Omit<ObjectType, KeysType>; // The rest of the keys.

export type S3Config = StorageAdapterBaseConfig &
  RequireAllOrNone<
    {
      bucket: string;
      region: string;
      key?: string;
      secret?: string;
      sslEnabled?: boolean;
      s3ForcePathStyle?: boolean;
      timeout?: number;
      agentProxy?: httpAgent | httpsAgent;
      endpoint?: string;
      debug?: boolean;
    },
    'key' | 'secret'
  >;

const streamToString = (stream: NodeJS.ReadableStream) =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });

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

  const cache = new Cache({
    verbose: !!conf.verbosity,
    refreshInterval: conf.refreshInterval
  });

  let requestHandler: NodeHttpHandler | undefined;
  if (conf.agentProxy) {
    const handlerOptions: NodeHttpHandlerOptions = {
      connectionTimeout: conf.timeout || 10000
    };
    if (sslEnabled) {
      handlerOptions.httpAgent = conf.agentProxy as httpAgent;
    } else {
      handlerOptions.httpsAgent = conf.agentProxy as httpsAgent;
    }
    requestHandler = new NodeHttpHandler(handlerOptions);
  }

  const getClient = () =>
    new S3({
      logger: conf.debug ? (console.log as any) : undefined,
      tls: sslEnabled,
      credentials: {
        accessKeyId: accessKeyId!,
        secretAccessKey: secretAccessKey!
      },
      requestHandler,
      endpoint: conf.endpoint,
      region,
      forcePathStyle: s3ForcePathStyle
    });

  const getFile = async (filePath: string, force = false) => {
    const getFromAws = async () => {
      try {
        const data = await getClient().getObject({
          Bucket: bucket,
          Key: filePath
        });

        return streamToString(data.Body as any);
      } catch (err) {
        throw (err as any).code === 'NoSuchKey'
          ? {
              code: strings.errors.STORAGE.FILE_NOT_FOUND_CODE,
              msg: strings.errors.STORAGE.FILE_NOT_FOUND(filePath)
            }
          : err;
      }
    };

    if (force) {
      return getFromAws();
    }

    const cached = cache.get('s3-file', filePath);
    if (cached) {
      return cached;
    }

    const result = await getFromAws();
    cache.set('s3-file', filePath, result);
    cache.sub('s3-file', filePath, getFromAws);

    return result;
  };

  const getJson = async (filePath: string, force = false) => {
    const file = await getFile(filePath, force);

    try {
      return JSON.parse(file);
    } catch (er) {
      throw {
        code: strings.errors.STORAGE.FILE_NOT_VALID_CODE,
        msg: strings.errors.STORAGE.FILE_NOT_VALID(filePath)
      };
    }
  };

  const getUrl = (componentName: string, version: string, fileName: string) =>
    `${conf.path}${componentName}/${version}/${fileName}`;

  const listSubDirectories = async (dir: string) => {
    const normalisedPath =
      dir.lastIndexOf('/') === dir.length - 1 && dir.length > 0
        ? dir
        : `${dir}/`;

    const data = await getClient().listObjects({
      Bucket: bucket,
      Prefix: normalisedPath,
      Delimiter: '/'
    });

    if (data.CommonPrefixes!.length === 0) {
      throw {
        code: strings.errors.STORAGE.DIR_NOT_FOUND_CODE,
        msg: strings.errors.STORAGE.DIR_NOT_FOUND(dir)
      };
    }

    const result = _.map(data.CommonPrefixes, commonPrefix =>
      commonPrefix.Prefix!.substr(
        normalisedPath.length,
        commonPrefix.Prefix!.length - normalisedPath.length - 1
      )
    );

    return result;
  };

  const putFileContent = async (
    fileContent: string | fs.ReadStream,
    fileName: string,
    isPrivate: boolean
  ) => {
    const fileInfo = getFileInfo(fileName);

    return getClient().putObject({
      Bucket: bucket,
      Key: fileName,
      Body: fileContent,
      ContentType: fileInfo.mimeType,
      ContentEncoding: fileInfo.gzip ? 'gzip' : undefined,
      ACL: isPrivate ? 'authenticated-read' : 'public-read',
      ServerSideEncryption: 'AES256',
      Expires: getNextYear()
    });
  };

  const putFile = (filePath: string, fileName: string, isPrivate: boolean) => {
    const stream = fs.createReadStream(filePath);

    return putFileContent(stream, fileName, isPrivate);
  };

  return {
    getFile,
    getJson,
    getUrl,
    listSubDirectories,
    maxConcurrentRequests: 20,
    putFile,
    putFileContent,
    adapterType: 's3',
    isValid
  };
}

module.exports = s3Adapter;
