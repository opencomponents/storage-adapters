import Cache from 'nice-cache';
import format from 'stringformat';
import fs from 'fs-extra';
import nodeDir, { PathsResult } from 'node-dir';
import { Storage, UploadOptions } from '@google-cloud/storage';
import tmp from 'tmp';
import {
  getFileInfo,
  strings,
  StorageAdapter
} from 'oc-storage-adapters-utils';
import { promisify } from 'util';

const getPaths: (path: string) => Promise<PathsResult> = promisify(
  nodeDir.paths
);

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

  const getFile = async (filePath: string, force = false) => {
    const getFromGs = async () => {
      try {
        const data = await getClient()
          .bucket(bucketName)
          .file(filePath)
          .download();

        return data.toString();
      } catch (err) {
        if ((err as any).code === 404) {
          throw {
            code: strings.errors.STORAGE.FILE_NOT_FOUND_CODE,
            msg: format(strings.errors.STORAGE.FILE_NOT_FOUND, filePath)
          };
        }
        throw {
          code: (err as any).code,
          msg: (err as any).message || (err as any).msg
        };
      }
    };

    if (force) {
      return getFromGs();
    }

    const cached = cache.get('gs-file', filePath);
    if (cached) {
      return cached;
    }

    const result = await getFromGs();
    cache.set('gs-file', filePath, result);
    cache.sub('gs-file', filePath, getFromGs);

    return result;
  };

  const getJson = async (filePath: string, force = false) => {
    const file = await getFile(filePath, force);

    try {
      return JSON.parse(file);
    } catch (er) {
      throw {
        code: strings.errors.STORAGE.FILE_NOT_VALID_CODE,
        msg: format(strings.errors.STORAGE.FILE_NOT_VALID, filePath)
      };
    }
  };

  const getUrl = (componentName: string, version: string, fileName: string) =>
    `${conf.path}${componentName}/${version}/${fileName}`;

  const listSubDirectories = async (dir: string) => {
    const normalisedPath =
      dir.lastIndexOf('/') === dir.length - 1 && dir.length > 0
        ? dir
        : dir + '/';

    const options = {
      prefix: normalisedPath
    };

    try {
      const results = await getClient().bucket(bucketName).getFiles(options);

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

      return result;
    } catch (err) {
      throw {
        code: strings.errors.STORAGE.DIR_NOT_FOUND_CODE,
        msg: format(strings.errors.STORAGE.DIR_NOT_FOUND, dir)
      };
    }
  };

  const putDir = async (dirInput: string, dirOutput: string) => {
    const paths = await getPaths(dirInput);

    return Promise.all(
      paths.files.map((file: string) => {
        const relativeFile = file.slice(dirInput.length);
        const url = (dirOutput + relativeFile).replace(/\\/g, '/');

        const serverPattern = /(\\|\/)server\.js/;
        const dotFilePattern = /(\\|\/)\..+/;
        const privateFilePatterns = [serverPattern, dotFilePattern];
        return putFile(
          file,
          url,
          privateFilePatterns.some(r => r.test(relativeFile))
        );
      })
    );
  };

  const putFileContent = async (
    fileContent: string,
    fileName: string,
    isPrivate: boolean
  ) => {
    const tmpobj = tmp.fileSync();

    fs.writeFileSync(tmpobj.name, fileContent);

    try {
      const result = await putFile(tmpobj.name, fileName, isPrivate);
      return result;
    } finally {
      tmpobj.removeCallback();
    }
  };

  const putFile = async (
    filePath: string,
    fileName: string,
    isPrivate: boolean
  ) => {
    const fileInfo = getFileInfo(fileName);
    const obj: {
      ACL: 'authenticated-read' | 'public-read';
      ContentType?: string;
      Bucket: string;
      Key: string;
      ContentEncoding?: string;
    } = {
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

    try {
      await getClient().bucket(bucketName).upload(filePath, options);

      if (obj.ACL === 'public-read') {
        await getClient().bucket(bucketName).file(fileName).makePublic();
      }

      return obj;
    } catch (err) {
      throw { code: (err as any).code, msg: (err as any).message };
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
    adapterType: 'gs',
    isValid
  };
}

module.exports = gsAdapter;
