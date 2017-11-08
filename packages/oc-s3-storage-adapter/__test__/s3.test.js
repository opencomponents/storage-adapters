'use strict';
const s3 = require('../');
const AWS = require('aws-sdk');

//Mock AWS functions
AWS.S3.prototype.getObject = (val, cb) => {
  cb(null, {
    Body: '{"data": "words"}'
  });
};

AWS.S3.prototype.listObjects = (val, cb) => {
  cb(null, {
    CommonPrefixes: [
      {
        Prefix: '/testPrefix/'
      },
      {
        Prefix: '/testPrefix2/'
      }
    ]
  });
};

//Mock Date functions
const DATE_TO_USE = new Date('2017');
const _Date = Date;
global.Date = jest.fn(() => DATE_TO_USE);
global.Date.UTC = _Date.UTC;
global.Date.parse = _Date.parse;
global.Date.now = _Date.now;

//Tests
test('should expose the correct methods', () => {
  const options = {
    bucket: 'test',
    region: 'region-test',
    key: 'test-key',
    secret: 'test-secret'
  };
  expect(new s3(options)).toMatchSnapshot();
});

test('validate valid conf', () => {
  const options = {
    bucket: 'test',
    region: 'region-test',
    key: 'test-key',
    secret: 'test-secret'
  };
  const client = new s3(options);
  expect(client.isValid()).toBe(true);
});

test('validate missing bucket conf', () => {
  const options = {
    region: 'region-test',
    key: 'test-key',
    secret: 'test-secret'
  };
  const client = new s3(options);
  expect(client.isValid()).toBe(false);
});

test('validate missing region conf', () => {
  const options = {
    bucket: 'test',
    key: 'test-key',
    secret: 'test-secret'
  };
  const client = new s3(options);
  expect(client.isValid()).toBe(false);
});

test('validate missing key conf', () => {
  const options = {
    bucket: 'test',
    region: 'region-test',
    secret: 'test-secret'
  };
  const client = new s3(options);
  expect(client.isValid()).toBe(false);
});

test('validate missing secret conf', () => {
  const options = {
    bucket: 'test',
    region: 'region-test',
    key: 'test-key'
  };
  const client = new s3(options);
  expect(client.isValid()).toBe(false);
});

test('validate missing key/secret conf', () => {
  const missingOptions = {
    bucket: 'test',
    region: 'region-test'
  };
  const client = new s3(missingOptions);
  expect(client.isValid()).toBe(true);
});

//Functions utilizing AWS

test('test getFile ', () => {
  const options = {
    bucket: 'test',
    region: 'region-test',
    key: 'test-key',
    secret: 'test-secret'
  };
  const client = new s3(options);
  const cb = (err, data) => {
    expect(data).toMatchSnapshot();
  };
  client.getFile('path/test.json', false, cb);
});

test('test getJSon ', () => {
  const options = {
    bucket: 'test',
    region: 'region-test',
    key: 'test-key',
    secret: 'test-secret',
    agentProxy: 'agentProxy'
  };
  const client = new s3(options);
  const cb = (err, data) => {
    expect(data).toMatchSnapshot();
  };
  client.getJson('path/test.json', false, cb);
});

test('test listObjects ', () => {
  const client = new s3({ bucket: 'my-bucket' });
  const cb = (err, data) => {
    expect(data).toMatchSnapshot();
  };
  client.listSubDirectories('path/', cb);
});

test('test getUrl ', () => {
  const client = new s3({ path: '/' });
  expect(client.getUrl('test', '1.0.0', 'test.js')).toMatchSnapshot();
});

test('test private putFileContent ', () => {
  const client = new s3({ bucket: 'my-bucket' });
  const cb = data => {
    expect(data).toMatchSnapshot();
  };

  AWS.S3.prototype.upload = data => ({ send: fn => fn(cb(data)) });
  client.putFileContent('words', 'filename.js', true, cb);
});

test('test public putFileContent ', () => {
  const client = new s3({ bucket: 'my-bucket' });
  const cb = data => {
    expect(data).toMatchSnapshot();
  };

  AWS.S3.prototype.upload = data => ({ send: fn => fn(cb(data)) });
  client.putFileContent('words', 'filename.gz', false, cb);
});

test('test putFile ', () => {
  const client = new s3({ bucket: 'my-bucket' });
  const cb = data => {
    expect(data).toMatchSnapshot();
  };

  AWS.S3.prototype.upload = data => ({ send: fn => fn(cb(data)) });
  client.putFile('package.json', 'filename.js', false, cb);
});
