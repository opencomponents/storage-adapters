const s3 = require('../');

//Mock Date functions
const DATE_TO_USE = new Date('2017');
const _Date = Date;
global.Date = jest.fn(() => DATE_TO_USE);
global.Date.UTC = _Date.UTC;
global.Date.parse = _Date.parse;
global.Date.now = _Date.now;

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

test('test getFile ', () => {
  const options = {
    bucket: 'test',
    region: 'region-test',
    key: 'test-key',
    secret: 'test-secret'
  };
  const client = new s3(options);

  client.getFile('path/test.txt', false, (err, data) => {
    expect(data).toMatchSnapshot();
  });
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

  client.getJson('path/test.json', false, (err, data) => {
    expect(data).toMatchSnapshot();
  });
});

test('test listObjects when bucket is not empty', () => {
  const client = new s3({ bucket: 'my-bucket' });

  client.listSubDirectories('components/', (err, data) => {
    expect(err).toBeNull();
    expect(data).toMatchSnapshot();
  });
});

test('test listObjects when bucket is empty ', () => {
  const client = new s3({ bucket: 'my-empty-bucket' });

  client.listSubDirectories('path/', (err, data) => {
    expect(err.code).toBe('dir_not_found');
    expect(err.msg).toBe('Directory "path/" not found');
  });
});

test('test getUrl ', () => {
  const client = new s3({ path: '/' });
  expect(client.getUrl('test', '1.0.0', 'test.js')).toMatchSnapshot();
});

test('test private putFileContent ', () => {
  const client = new s3({ bucket: 'my-bucket' });

  client.putFileContent('words', 'filename.js', true, (err, data) => {
    expect(data.ACL).toBe('authenticated-read');
  });
});

test('test public putFileContent ', () => {
  const client = new s3({ bucket: 'my-bucket' });

  client.putFileContent('words', 'filename.gz', false, (err, data) => {
    expect(data.ACL).toBe('public-read');
  });
});

test('put a js file ', () => {
  const client = new s3({ bucket: 'my-bucket' });

  client.putFile('../path', 'hello.js', false, (err, data) => {
    expect(data.ContentType).toBe('application/javascript');
  });
});

test('put a gzipped js file ', () => {
  const client = new s3({ bucket: 'my-bucket' });

  client.putFile('../path', 'hello.js.gz', false, (err, data) => {
    expect(data.ContentType).toBe('application/javascript');
    expect(data.ContentEncoding).toBe('gzip');
  });
});

test('put a css file ', () => {
  const client = new s3({ bucket: 'my-bucket' });

  client.putFile('../path', 'hello.css', false, (err, data) => {
    expect(data.ContentType).toBe('text/css');
  });
});

test('put a gzipped css file ', () => {
  const client = new s3({ bucket: 'my-bucket' });

  client.putFile('../path', 'hello.css.gz', false, (err, data) => {
    expect(data.ContentType).toBe('text/css');
    expect(data.ContentEncoding).toBe('gzip');
  });
});

test('put a jpg file ', () => {
  const client = new s3({ bucket: 'my-bucket' });

  client.putFile('../path', 'hello.jpg', false, (err, data) => {
    expect(data.ContentType).toBe('image/jpeg');
  });
});

test('put a gif file ', () => {
  const client = new s3({ bucket: 'my-bucket' });

  client.putFile('../path', 'hello.gif', false, (err, data) => {
    expect(data.ContentType).toBe('image/gif');
  });
});

test('put a png file ', () => {
  const client = new s3({ bucket: 'my-bucket' });

  client.putFile('../path', 'hello.png', false, (err, data) => {
    expect(data.ContentType).toBe('image/png');
  });
});
