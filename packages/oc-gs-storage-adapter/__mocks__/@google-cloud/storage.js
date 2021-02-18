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

let mockCachedTxt = 0;
let mockCachedJson = 0;
const googleStorage = jest.genMockFromModule('@google-cloud/storage');

const _Storage = class {
  constructor() {
    this.bucket = jest.fn(bucket => ({
      getFiles: () => {
        const files =
          bucket === 'my-empty-bucket'
            ? []
            : [
              [
                {
                  name: 'components/image/1.0.0/app.js'
                },
                {
                  name: 'components/image/1.0.0/server.js'
                },
                {
                  name: 'components/image/1.0.1/new-server.js'
                },
                {
                  name: 'components/image/1.0.1/new-app.js'
                }
              ]
            ];
        return Promise.resolve(files);
      },
      upload: (filePath, { destination }) => {
        if (destination.match('-error')) {
          return Promise.reject({
            code: 1234,
            message: 'an error message'
          });
        }
        return Promise.resolve();
      },
      file: file => ({
        makePublic() {
          return Promise.resolve();
        },
        download() {
          mockCachedTxt++;
          mockCachedJson++;
          const contents = {
            'path/test.txt': 'Hello!',
            'path/test.json': JSON.stringify({ value: 'Hello!' }),
            'path/not-found.txt': { error: { code: 404 } },
            'path/not-found.json': { error: { code: 404 } },
            'path/not-a-json.json': {
              error: { code: '1', msg: 'not an error' }
            },
            'path/to-mutable.json': JSON.stringify({ value: mockCachedJson }),
            'path/to-mutable.txt': mockCachedTxt
          };
          const content = contents[file];
          if (content.error) {
            return Promise.reject(content.error);
          } else {
            return Promise.resolve(content);
          }
        }
      })
    }));
  }
};

googleStorage.Storage = _Storage;
module.exports = googleStorage;
