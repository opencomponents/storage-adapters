import Cache from 'nice-cache';
import fs from 'fs-extra';
import _ from 'lodash';
import nodeDir, { PathsResult } from 'node-dir';
import { Storage, UploadOptions } from '@google-cloud/storage';
import tmp from 'tmp';
import {
  getFileInfo,
  strings,
  StorageAdapter,
  DirectoryListing
} from 'oc-storage-adapters-utils';
import { promisify } from 'util';
import path from 'path';

const getPaths: (path: string) => Promise<PathsResult> = promisify(
  nodeDir.paths
);

// const testList = [
//   'components-details.json',
//   'components.json',
//   'oc-client/0.49.15/package.json',
//   'oc-client/0.49.15/server.js',
//   'oc-client/0.49.15/src/oc-client.min.js',
//   'oc-client/0.49.15/src/oc-client.min.map',
//   'oc-client/0.49.15/template.js',
//   'testoc/1.0.3/package.json',
//   'testoc/1.0.3/react-component.js',
//   'testoc/1.0.3/server.js',
//   'testoc/1.0.3/styles.css',
//   'testoc/1.0.3/template.js',
//   'testoc/1.0.4/package.json',
//   'testoc/1.0.4/react-component.js',
//   'testoc/1.0.4/server.js',
//   'testoc/1.0.4/styles.css',
//   'testoc/1.0.4/template.js'
// ];

export interface GsConfig {
  bucket: string;
  projectId: string;
  path: string;
  maxAge?: boolean;
  verbosity?: boolean;
  refreshInterval?: number;
}

export function partition<T, U extends T>(
  array: readonly T[],
  predicate: (el: T) => el is U
): [U[], Exclude<T, U>[]];
export function partition<T>(
  array: readonly T[],
  predicate: (el: T) => boolean
): [T[], T[]];
export function partition(
  array: readonly unknown[],
  predicate: (el: unknown) => boolean
): [unknown[], unknown[]] {
  const matches: Array<unknown> = [];
  const rest: Array<unknown> = [];
  for (const element of array) {
    if (predicate(element)) {
      matches.push(element);
    } else {
      rest.push(element);
    }
  }
  return [matches, rest];
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
            msg: strings.errors.STORAGE.FILE_NOT_FOUND(filePath)
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
        msg: strings.errors.STORAGE.FILE_NOT_VALID(filePath)
      };
    }
  };

  const getUrl = (componentName: string, version: string, fileName: string) =>
    `${conf.path}${componentName}/${version}/${fileName}`;

  const listDirectory = async (dir: string) => {
    const normalisedPath =
      dir.lastIndexOf('/') === dir.length - 1 && dir.length > 0
        ? dir
        : `${dir}/`;
    const options = {
      prefix: normalisedPath
    };

    const [fileList] = await getClient().bucket(bucketName).getFiles(options);

    const relativePaths = fileList.map(file =>
      file.name.replace(normalisedPath, '')
    );
    const files = relativePaths.filter(path => !path.match('/'));
    const directories = _.uniq(
      relativePaths
        .filter(path => !!path.match('/'))
        .map(path => path.split('/')[0])
    );

    const list: DirectoryListing[] = [
      ...files.map(file => ({ name: file, type: 'file' } as const)),
      ...directories.map(dir => ({ name: dir, type: 'directory' } as const))
    ];

    return list;
  };

  const listSubDirectories = async (dir: string) => {
    try {
      const list = await listDirectory(dir);

      return list.filter(x => x.type === 'directory').map(x => x.name);
    } catch (err) {
      throw {
        code: strings.errors.STORAGE.DIR_NOT_FOUND_CODE,
        msg: strings.errors.STORAGE.DIR_NOT_FOUND(dir)
      };
    }
  };

  const putDir = async (dirInput: string, dirOutput: string) => {
    const paths = await getPaths(dirInput);
    const packageJsonFile = path.join(dirInput, 'package.json');
    const files = paths.files.filter(file => file !== packageJsonFile);

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
          privateFilePatterns.some(r => r.test(relativeFile))
        );
      })
    );
    // Ensuring package.json is uploaded last so we can verify that a component
    // was properly uploaded by checking if package.json exists
    const packageJsonFileResult = await putFile(
      packageJsonFile,
      `${dirOutput}/package.json`.replace(/\\/g, '/'),
      false
    );

    return [...filesResults, packageJsonFileResult];
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
    listDirectory,
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
