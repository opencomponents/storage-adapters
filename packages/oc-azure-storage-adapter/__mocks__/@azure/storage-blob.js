const azure = jest.genMockFromModule('azure-storage');
const stream = require('stream');

jest.mock('fs-extra', () => {
  return {
    createReadStream: jest.fn(() => 'this is a stream'),
    readFile: jest.fn(cb => cb(null, 'file content!'))
  };
});

let cachedTxt = 0;
let cachedJson = 0;

const blobServiceClient = {
  getContainerClient(containerName) {
    return {
      getBlobClient(filePath) {
        return {
          async download() {
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
              'path/to-mutable.txt': { content: String(cachedTxt) }
            };

            const testResult = contents[filePath];

            if (testResult.error) throw testResult.error;

            return {
              readableStreamBody: stream.Readable.from([testResult.content])
            };
          }
        };
      },
      getBlockBlobClient(fileName) {
        return {
          async uploadData(content, settings) {
            if (fileName.indexOf('error') >= 0) {
              throw { msg: 'sorry' };
            }

            return {
              fileName,
              lengthWritten: content.length,
              container: containerName,
              settings
            };
          }
        };
      },
      listBlobsByHierarchy(delimiter, { prefix }) {
        return {
          async *[Symbol.asyncIterator]() {
            const entries = {
              'components/': [
                { name: 'components/image', kind: 'prefix' },
                {
                  name: 'components/components/details.json',
                  kind: 'blob'
                }
              ],
              'components/image/': [
                { name: 'components/image/1.0.0', kind: 'prefix' },
                { name: 'components/image/1.0.1', kind: 'prefix' }
              ],
              'components/image/1.0.0': [
                { name: 'components/image/1.0.1/image.png', kind: 'blob' }
              ]
            };

            const blobs = entries[prefix] || [];

            for (const entry of blobs) {
              yield entry;
            }
          }
        };
      }
    };
  }
};

azure.StorageSharedKeyCredential = jest.fn(function (account, key) {
  return { account, key };
});
azure.BlobServiceClient = jest.fn(function (url, credentials) {
  return { _credentials: credentials, _url: url, ...blobServiceClient };
});
module.exports = azure;
