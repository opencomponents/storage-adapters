const azure = jest.genMockFromModule('azure-storage');
const stream = require('stream');

class LengthCallbackStream extends stream.Writable {
  constructor(lengthWrittenCallback) {
    super();
    this.lengthWrittenCallback = lengthWrittenCallback;
  }
  _write(chunk, enc, next) {
    this.lengthWrittenCallback(chunk.toString().length);
    next();
  }
}

jest.mock('fs-extra', () => {
  return {
    createReadStream: jest.fn(() => 'this is a stream'),
    readFile: jest.fn(cb => cb(null, 'file content!'))
  };
});

jest.mock('node-dir', () => {
  return {
    paths: jest.fn((pathToDir, cb) => {
      cb(null, {
        files: [
          `${pathToDir}\\package.json`,
          `${pathToDir}\\server.js`,
          `${pathToDir}\\template.js`,
          `${pathToDir}/package.json`,
          `${pathToDir}/server.js`,
          `${pathToDir}/template.js`
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
      const entriesToReturn = [
        { name: 'components/image/1.0.0/image.png' }
      ].filter(entry => entry.name.startsWith(prefix));
      return callback(null, {
        entries: entriesToReturn,
        continuationToken: 'go!'
      });
    }

    const entriesToReturn = [
      {
        name: 'components/image/1.0.1/image.png'
      },
      {
        name: 'components/components-details.json'
      }
    ].filter(entry => entry.name.startsWith(prefix));
    return callback(null, { entries: entriesToReturn });
  },
  createWriteStreamToBlockBlob: (containerName, fileName, _, callback) => {
    let lengthWritten = 0;
    const writeStream = new LengthCallbackStream(
      length => (lengthWritten += length)
    );
    writeStream.on('finish', () =>
      callback(null, { lengthWritten, container: containerName })
    );
    return writeStream;
  },
  createReadStream: (containerName, fileName) => {
    const fileStream = new stream.Readable();
    fileStream.push(`${containerName}${fileName}`);
    fileStream.push(null);
    return fileStream;
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
