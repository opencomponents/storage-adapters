import {
  BlobServiceClient,
  StorageSharedKeyCredential,
  BlockBlobUploadOptions
} from '@azure/storage-blob';
import Cache from 'nice-cache';
import fs from 'fs-extra';
import nodeDir, { PathsResult } from 'node-dir';
import { promisify } from 'util';
import {
  getFileInfo,
  strings,
  StorageAdapter,
  StorageAdapterBaseConfig
} from 'oc-storage-adapters-utils';
import path from 'path';

const getPaths: (path: string) => Promise<PathsResult> = promisify(
  nodeDir.paths
);

// [Node.js only] A helper method used to read a Node.js readable stream into a Buffer
async function streamToBuffer(readableStream: NodeJS.ReadableStream) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    readableStream.on('data', data => {
      chunks.push(data instanceof Buffer ? data : Buffer.from(data));
    });
    readableStream.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    readableStream.on('error', reject);
  });
}

export interface AzureConfig extends StorageAdapterBaseConfig {
  publicContainerName: string;
  privateContainerName: string;
  accountName: string;
  accountKey: string;
}

export default function azureAdapter(conf: AzureConfig): StorageAdapter {
  const isValid = () => {
    if (
      !conf.publicContainerName ||
      !conf.privateContainerName ||
      !conf.accountName ||
      !conf.accountKey
    ) {
      return false;
    }
    return true;
  };

  const cache = new Cache({
    verbose: !!conf.verbosity,
    refreshInterval: conf.refreshInterval
  });

  let client: BlobServiceClient | undefined = undefined;

  const getClient = () => {
    if (!client) {
      const sharedKeyCredential = new StorageSharedKeyCredential(
        conf.accountName,
        conf.accountKey
      );
      client = new BlobServiceClient(
        `https://${conf.accountName}.blob.core.windows.net`,
        sharedKeyCredential
      );
      
    }
    return client;
  };

  const getFile = async (filePath: string, force = false) => {
    const getFromAzure = async () => {
      const client = getClient();
      const containerClient = client.getContainerClient(
        conf.privateContainerName
      );
      const blobClient = containerClient.getBlobClient(filePath);
      try {
        const downloadBlockBlobResponse = await blobClient.download();
        const fileContent = (
          await streamToBuffer(downloadBlockBlobResponse.readableStreamBody!)
        ).toString();

        return fileContent;
      } catch (err) {
        if ((err as any).statusCode === 404) {
          throw {
            code: strings.errors.STORAGE.FILE_NOT_FOUND_CODE,
            msg: strings.errors.STORAGE.FILE_NOT_FOUND(filePath)
          };
        }
        throw err;
      }
    };

    if (force) {
      return getFromAzure();
    }

    const cached = cache.get('azure-file', filePath);

    if (cached) {
      return cached;
    }

    const result = await getFromAzure();
    cache.set('azure-file', filePath, result);
    cache.sub('azure-file', filePath, getFromAzure);

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

    const containerClient = getClient().getContainerClient(
      conf.privateContainerName
    );
    const subDirectories = [];

    for await (const item of containerClient.listBlobsByHierarchy('/', {
      prefix: normalisedPath
    })) {
      if (item.kind === 'prefix') {
        const subDirectory = item.name
          .replace(normalisedPath, '')
          .replace(/\/$/, '');

        subDirectories.push(subDirectory);
      }
    }

    return subDirectories;
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
    client: BlobServiceClient
  ) => {
    const content =
      typeof fileContent === 'string'
        ? Buffer.from(fileContent)
        : await streamToBuffer(fileContent);

    const uploadToAzureContainer = (containerName: string) => {
      const fileInfo = getFileInfo(fileName);
      const blobHTTPHeaders: BlockBlobUploadOptions['blobHTTPHeaders'] = {
        blobCacheControl: 'public, max-age=31556926'
      };

      if (fileInfo.mimeType) {
        blobHTTPHeaders.blobContentType = fileInfo.mimeType;
      }

      if (fileInfo.gzip) {
        blobHTTPHeaders.blobContentEncoding = 'gzip';
      }
      const localClient = client ? client : getClient();
      const containerClient = localClient.getContainerClient(containerName);
      const blockBlobClient = containerClient.getBlockBlobClient(fileName);

      return blockBlobClient.uploadData(content, {
        blobHTTPHeaders
      });
    };

    let result = await uploadToAzureContainer(conf.privateContainerName);
    if (!isPrivate) {
      result = await uploadToAzureContainer(conf.publicContainerName);
    }
    return result;
  };

  const putFile = (filePath: string, fileName: string, isPrivate: boolean, client: BlobServiceClient) => {
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
    adapterType: 'azure-blob-storage',
    isValid
  };
}

module.exports = azureAdapter;
