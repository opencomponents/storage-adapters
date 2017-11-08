'use strict';
const gs = require('../');
const Storage = require('@google-cloud/storage');

// //Mock AWS functions
// AWS.S3.prototype.getObject = (val, cb) => {
//   cb(null, {
//     Body: '{"data": "words"}'
//   });
// };
//
// AWS.S3.prototype.listObjects = (val, cb) => {
//   cb(null, {
//     CommonPrefixes: [
//       {
//         Prefix: '/testPrefix/'
//       },
//       {
//         Prefix: '/testPrefix2/'
//       }
//     ]
//   });
// };

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
    prodjectId: '12345',
    path: 'somepath'
  };
  expect(new gs(options)).toMatchSnapshot();
});

test('validate valid conf', () => {
  const options = {
    bucket: 'test',
    projectId: '12345',
    path: 'somepath'
  };
  const client = new gs(options);
  expect(client.isValid()).toBe(true);
});

test('validate missing bucket conf', () => {
  const options = {
    projectId: '12345',
    path: 'somepath'
  };
  const client = new gs(options);
  expect(client.isValid()).toBe(false);
});

test('validate missing project conf', () => {
  const options = {
    bucket: 'test',
    path: 'somepath'
  };
  const client = new gs(options);
  expect(client.isValid()).toBe(false);
});

test('validate missing path conf', () => {
  const options = {
    bucket: 'test',
    projectId: '12345'
  };
  const client = new gs(options);
  expect(client.isValid()).toBe(false);
});

//Functions utilizing AWS

test('test getFile ', () => {
  const options = {
    bucket: 'test',
    projectId: '12345',
    path: 'somepath'
  };
  const client = new gs(options);
  const cb = (err, data) => {
    expect(data).toMatchSnapshot();
  };
  client.getFile('path/test.json', false, cb);
});

test('test getJSon ', () => {
  const options = {
    bucket: 'test',
    projectId: '12345',
    path: 'somepath'
  };
  const client = new gs(options);
  const cb = (err, data) => {
    expect(data).toMatchSnapshot();
  };
  client.getJson('path/test.json', false, cb);
});

test('test listObjects ', () => {
  const client = new gs({ bucket: 'my-bucket' });
  const cb = (err, data) => {
    expect(data).toMatchSnapshot();
  };
  client.listSubDirectories('path/', cb);
});

test('test getUrl ', () => {
  const client = new gs({ path: '/' });
  expect(client.getUrl('test', '1.0.0', 'test.js')).toMatchSnapshot();
});

test('test private putFileContent ', () => {
  const client = new gs({ bucket: 'my-bucket' });
  const cb = data => {
    expect(data).toMatchSnapshot();
  };

  Storage.prototype.upload = data => ({ send: fn => fn(cb(data)) });
  client.putFileContent('words', 'filename.js', true, cb);
});

test('test public putFileContent ', () => {
  const client = new gs({ bucket: 'my-bucket' });
  const cb = data => {
    expect(data).toMatchSnapshot();
  };

  Storage.prototype.upload = data => ({ send: fn => fn(cb(data)) });
  client.putFileContent('words', 'filename.gz', false, cb);
});

test('test putFile ', () => {
  const client = new gs({ bucket: 'my-bucket' });
  const cb = data => {
    expect(data).toMatchSnapshot();
  };

  Storage.prototype.upload = data => ({ send: fn => fn(cb(data)) });
  client.putFile('package.json', 'filename.js', false, cb);
});
