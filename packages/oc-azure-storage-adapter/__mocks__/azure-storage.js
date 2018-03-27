const azure = jest.genMockFromModule('azure-storage');

jest.mock('fs-extra', () => {
  return {
    createReadStream: jest.fn(() => 'this is a stream'),
    readFile: jest.fn(cb => cb(null, 'file content!'))
  };
});

jest.mock('node-dir', () => {
  return {
    paths: jest.fn((pathToDir, cb) => {
      const sep = require('path').sep;
      cb(null, {
        files: [
          `${pathToDir}${sep}package.json`,
          `${pathToDir}${sep}server.js`,
          `${pathToDir}${sep}template.js`
        ]
      });
    })
  };
});

let cachedTxt = 0;
let cachedJson = 0;
const blobService = {
  getBlobToText: (containerName, filePath, callback) => {
    cachedTxt++;
    cachedJson++;
    let notExistsError = {
      name: 'StorageError',
      code: 'BlobNotFound',
      statusCode: 404
    };
    const contents = {
      'path/test.txt': { content: 'Hello!' },
      'path/test.json': { content: JSON.stringify({ data: 'Hello!' }) },
      'path/not-found.txt': { error: notExistsError },
      'path/not-found.json': { error: notExistsError },
      'path/not-a-json.json': { content: 'Not a json' },
      'path/to-mutable.json': {
        content: JSON.stringify({ value: cachedJson })
      },
      'path/to-mutable.txt': { content: cachedTxt }
    };

    const testResult = contents[filePath];

    callback(testResult.error || null, testResult.content);
  },
  listBlobsSegmentedWithPrefix: (containerName, prefix, token, callback) => {
    if (containerName === 'my-empty-container') {
      return callback(null, { entries: [] });
    }

    if (!token) {
      return callback(null, {
        entries: [{ name: 'components/image/1.0.0/' }],
        continuationToken: 'go!'
      });
    }

    return callback(null, { entries: [{ name: 'components/image/1.0.1/' }] });
  },
  createBlockBlobFromText: (containerName, fileName, __, ___, callback) => {
    let error;
    if (fileName.indexOf('error') >= 0) {
      if (fileName.indexOf('throw') >= 0) {
        throw new Error('sorry');
        return;
      }

      error = { msg: 'sorry' };
    }

    return callback(error, !error ? { container: containerName } : undefined);
  }
};

azure.createBlobService = jest.fn(() => blobService);
module.exports = azure;
