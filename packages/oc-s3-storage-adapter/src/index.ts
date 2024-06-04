import { S3, S3ClientConfig } from '@aws-sdk/client-s3';
import {
  NodeHttpHandler,
  NodeHttpHandlerOptions
} from '@aws-sdk/node-http-handler';
import Cache from 'nice-cache';
import fs from 'fs-extra';
import nodeDir, { PathsResult } from 'node-dir';
import _ from 'lodash';
import { promisify } from 'util';

import {
  getFileInfo,
  getNextYear,
  strings,
  StorageAdapter,
  StorageAdapterBaseConfig
} from 'oc-storage-adapters-utils';
import path from 'path';

import type { Agent as httpAgent } from 'http';
import type { Agent as httpsAgent } from 'https';

const getPaths: (path: string) => Promise<PathsResult> = promisify(
  nodeDir.paths
);

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

  let client: S3 | undefined = undefined;

  const getClient = () => {
    if (!client) {
      const configOpts: S3ClientConfig = {
        logger: conf.debug ? (console as any) : undefined,
        tls: sslEnabled,
        requestHandler,
        endpoint: conf.endpoint,
        region,
        forcePathStyle: s3ForcePathStyle
      }
      if (accessKeyId && secretAccessKey) {
        configOpts.credentials = {
          accessKeyId,
          secretAccessKey
        };
      }
      client = new S3(configOpts);
    }
    return client;
  };

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

  const putDir = async (dirInput: string, dirOutput: string) => {
    const paths = await getPaths(dirInput);
    const packageJsonFile = path.join(dirInput, 'package.json');
    const files = paths.files.filter(file => file !== packageJsonFile);
    const client = getClient();

    const filesResults = await Promise.all(
      files.map((file: string) => {
        const relativeFile = file.slice(dirInput.length);
        const url = (dirOutput + relativeFile).replace(/\\/g, '/');

        const serverPattern = /(\\|\/)server\.js/;
        const dotFilePattern = /(\\|\/)\..+/;
        const privateFilePatterns = [serverPattern, dotFilePattern];
        return putFile(
          file,
          url,
          privateFilePatterns.some(r => r.test(relativeFile)),
          client
        );
      })
    );
    // Ensuring package.json is uploaded last so we can verify that a component
    // was properly uploaded by checking if package.json exists
    const packageJsonFileResult = await putFile(
      packageJsonFile,
      `${dirOutput}/package.json`.replace(/\\/g, '/'),
      false,
      client
    );

    return [...filesResults, packageJsonFileResult];
  };

  const putFileContent = async (
    fileContent: string | fs.ReadStream,
    fileName: string,
    isPrivate: boolean,
    client: S3
  ) => {
    const fileInfo = getFileInfo(fileName);
    const localClient = client ? client : getClient();

    return localClient.putObject({
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

  const putFile = (filePath: string, fileName: string, isPrivate: boolean, client: S3) => {
    const stream = fs.createReadStream(filePath);

    return putFileContent(stream, fileName, isPrivate, client);
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
}

module.exports = s3Adapter;
