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
  const client = new s3(options);

  [
    { method: 'adapterType', value: 's3' },
    { method: 'getFile', type: Function },
    { method: 'getJson', type: Function },
    { method: 'getUrl', type: Function },
    { method: 'isValid', type: Function },
    { method: 'listSubDirectories', type: Function },
    { method: 'maxConcurrentRequests', value: 20 },
    { method: 'putDir', type: Function },
    { method: 'putFileContent', type: Function }
  ].forEach(api => {
    if (api.type === Function) {
      expect(client[api.method]).toBeInstanceOf(api.type);
    } else {
      expect(client[api.method]).toBe(api.value);
    }
  });
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

[
  { src: 'path/test.txt', expected: { err: null, data: 'Hello!' } },
  { src: 'path/test.json', expected: { err: null, data: { data: 'Hello!' } } },
  {
    src: 'path/not-found.txt',
    expected: {
      err: {
        code: 'file_not_found',
        msg: 'File "path/not-found.txt" not found'
      }
    }
  },
  {
    src: 'path/not-found.json',
    expected: {
      err: {
        code: 'file_not_found',
        msg: 'File "path/not-found.json" not found'
      }
    }
  },
  {
    src: 'path/not-a-json.json',
    expected: {
      err: {
        code: 'file_not_valid',
        msg: 'File "path/not-a-json.json" not valid'
      }
    }
  }
].forEach(scenario => {
  test(`test getFile ${scenario.src}`, done => {
    const options = {
      bucket: 'test',
      region: 'region-test',
      key: 'test-key',
      secret: 'test-secret'
    };
    const client = new s3(options);

    client[scenario.src.match(/\.json$/) ? 'getJson' : 'getFile'](
      scenario.src,
      false,
      (err, data) => {
        expect(err).toEqual(scenario.expected.err);
        expect(data).toEqual(scenario.expected.data);
        done();
      }
    );
  });
});

test('test getFile force mode', done => {
  const options = {
    bucket: 'test',
    region: 'region-test',
    key: 'test-key',
    secret: 'test-secret'
  };

  const client = new s3(options);

  client.getFile('path/to-mutable.txt', false, (err1, data1) => {
    client.getFile('path/to-mutable.txt', (err2, data2) => {
      client.getFile('path/to-mutable.txt', true, (err3, data3) => {
        expect(err1).toBeNull();
        expect(err2).toBeNull();
        expect(err3).toBeNull();
        expect(data1).toBe(data2);
        expect(data3).not.toBe(data1);
        done();
      });
    });
  });
});

test('test getJson force mode', done => {
  const options = {
    bucket: 'test',
    region: 'region-test',
    key: 'test-key',
    secret: 'test-secret'
  };

  const client = new s3(options);

  client.getJson('path/to-mutable.json', false, (err1, data1) => {
    client.getJson('path/to-mutable.json', (err2, data2) => {
      client.getJson('path/to-mutable.json', true, (err3, data3) => {
        expect(err1).toBeNull();
        expect(err2).toBeNull();
        expect(err3).toBeNull();
        expect(data1.value).toBe(data2.value);
        expect(data3.value).not.toBe(data1.value);
        done();
      });
    });
  });
});

[
  { path: 'components/', expected: ['image/1.0.0', 'image/1.0.1'] },
  { path: 'components/image', expected: ['1.0.0', '1.0.1'] },
  { path: 'components/image/', expected: ['1.0.0', '1.0.1'] }
].forEach(scenario => {
  test(`test listObjects when bucket is not empty for folder ${
    scenario.path
  }`, done => {
    const client = new s3({ bucket: 'my-bucket' });

    client.listSubDirectories(scenario.path, (err, data) => {
      expect(err).toBeNull();
      expect(data).toEqual(scenario.expected);
      done();
    });
  });
});

['hello', 'path/'].forEach(scenario => {
  test(`test listObjects when bucket is empty for folder ${scenario}`, done => {
    const client = new s3({ bucket: 'my-empty-bucket' });

    client.listSubDirectories(scenario, (err, data) => {
      expect(data).toBeUndefined();
      expect(err.code).toBe('dir_not_found');
      expect(err.msg).toBe(`Directory "${scenario}" not found`);
      done();
    });
  });
});

test('test getUrl ', () => {
  const client = new s3({ path: '/' });
  expect(client.getUrl('test', '1.0.0', 'test.js')).toBe('/test/1.0.0/test.js');
});

test('test put dir (failure)', done => {
  const client = new s3({ bucket: 'my-bucket' });

  client.putDir(
    '/absolute-path-to-dir',
    'components\\componentName-error\\1.0.0',
    (err, res) => {
      expect(res).toBeUndefined();
      expect(err).toEqual({
        code: 1234,
        message: 'an error message',
        retryable: true,
        statusCode: 500,
        time: DATE_TO_USE,
        hostname: 'hostname',
        region: 'us-west2'
      });
      done();
    }
  );
});

test('test put dir (stream failure throwing)', done => {
  const client = new s3({ bucket: 'my-bucket' });

  client.putDir(
    '/absolute-path-to-dir',
    'components\\componentName-error-throw\\1.0.0',
    (err, res) => {
      expect(res).toBeUndefined();
      expect(err.toString()).toContain('sorry');
      done();
    }
  );
});

test('test private putFileContent ', done => {
  const client = new s3({ bucket: 'my-bucket' });

  client.putFileContent('words', 'filename.js', true, (err, data) => {
    expect(data.ACL).toBe('authenticated-read');
    done();
  });
});

test('test public putFileContent ', done => {
  const client = new s3({ bucket: 'my-bucket' });

  client.putFileContent('words', 'filename.gz', false, (err, data) => {
    expect(data.ACL).toBe('public-read');
    done();
  });
});

test('put a js file ', done => {
  const client = new s3({ bucket: 'my-bucket' });

  client.putFile('../path', 'hello.js', false, (err, data) => {
    expect(data.ContentType).toBe('application/javascript');
    done();
  });
});

test('put a gzipped js file ', done => {
  const client = new s3({ bucket: 'my-bucket' });

  client.putFile('../path', 'hello.js.gz', false, (err, data) => {
    expect(data.ContentType).toBe('application/javascript');
    expect(data.ContentEncoding).toBe('gzip');
    done();
  });
});

test('put a css file ', done => {
  const client = new s3({ bucket: 'my-bucket' });

  client.putFile('../path', 'hello.css', false, (err, data) => {
    expect(data.ContentType).toBe('text/css');
    done();
  });
});

test('put a gzipped css file ', done => {
  const client = new s3({ bucket: 'my-bucket' });

  client.putFile('../path', 'hello.css.gz', false, (err, data) => {
    expect(data.ContentType).toBe('text/css');
    expect(data.ContentEncoding).toBe('gzip');
    done();
  });
});

test('put a jpg file ', done => {
  const client = new s3({ bucket: 'my-bucket' });

  client.putFile('../path', 'hello.jpg', false, (err, data) => {
    expect(data.ContentType).toBe('image/jpeg');
    done();
  });
});

test('put a gif file ', done => {
  const client = new s3({ bucket: 'my-bucket' });

  client.putFile('../path', 'hello.gif', false, (err, data) => {
    expect(data.ContentType).toBe('image/gif');
    done();
  });
});

test('put a png file ', done => {
  const client = new s3({ bucket: 'my-bucket' });

  client.putFile('../path', 'hello.png', false, (err, data) => {
    expect(data.ContentType).toBe('image/png');
    done();
  });
});
