const awsSdk = jest.genMockFromModule('aws-sdk');
const _config = { update: jest.fn() };

jest.mock('fs-extra', () => {
  return {
    createReadStream: jest.fn(() => 'this is a stream'),
    readFile: jest.fn(cb => cb(null, 'file content!'))
  };
});

const _S3 = class {
  constructor() {
    this.getObject = jest.fn((val, cb) => {
      const content = val.Key.match(/\.txt/) ? 'Hello!' : '{"data":"Hello!"}';
      cb(null, {
        Body: content
      });
    });
    this.listObjects = jest.fn((val, cb) => {
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

      cb(null, {
        CommonPrefixes
      });
    });
    this.upload = jest.fn(data => {
      return {
        send: jest.fn(cb => cb(null, data))
      };
    });
  }
};

awsSdk.config = _config;
awsSdk.S3 = _S3;

module.exports = awsSdk;
