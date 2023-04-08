const awsSdk = jest.genMockFromModule('@aws-sdk/client-s3');
const stream = require('stream');
const _config = { update: jest.fn() };

jest.mock('fs-extra', () => {
  return {
    createReadStream: jest.fn(() => 'this is a stream'),
    readFile: jest.fn(cb => cb(null, 'file content!'))
  };
});

let cachedTxt = 0;
let cachedJson = 0;
const _S3 = class {
  constructor() {
    this.getObject = jest.fn(val => {
      cachedTxt++;
      cachedJson++;
      const contents = {
        'path/test.txt': { content: 'Hello!' },
        'path/test.json': { content: JSON.stringify({ data: 'Hello!' }) },
        'path/not-found.txt': { error: { code: 'NoSuchKey' } },
        'path/not-found.json': { error: { code: 'NoSuchKey' } },
        'path/not-a-json.json': { content: 'Not a json' },
        'path/to-mutable.json': {
          content: JSON.stringify({ value: cachedJson })
        },
        'path/to-mutable.txt': { content: cachedTxt }
      };

      const testResult = contents[val.Key];
      if (testResult.error) throw testResult.error;

      return {
        Body: stream.Readable.from([Buffer.from(String(testResult.content))])
      };
    });

    this.listObjects = jest.fn(val => {
      const CommonPrefixes =
        val.Bucket === 'my-empty-bucket'
          ? []
          : [
              {
                Prefix: 'components/image/1.0.0/'
              },
              {
                Prefix: 'components/image/1.0.1/'
              }
            ];

      return Promise.resolve({ CommonPrefixes });
    });

    this.putObject = jest.fn(data => {
      if (data && data.Key && data.Key.indexOf('error') >= 0) {
        if (data.Key.indexOf('throw') >= 0) {
          throw new Error('sorry');
        }

        throw {
          code: 1234,
          message: 'an error message',
          retryable: true,
          statusCode: 500,
          time: new Date(),
          hostname: 'hostname',
          region: 'us-west2'
        };
      }

      return data;
    });
  }
};

awsSdk.config = _config;
awsSdk.S3 = _S3;

module.exports = awsSdk;
