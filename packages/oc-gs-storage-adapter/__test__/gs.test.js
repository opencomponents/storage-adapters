const gs = require('../lib');

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
    prodjectId: '12345',
    path: 'somepath'
  };
  const client = new gs(options);
  [
    { method: 'adapterType', value: 'gs' },
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

// Functions utilizing Google Storage
[
  { src: 'path/test.txt', expected: { err: null, data: 'Hello!' } },
  { src: 'path/test.json', expected: { err: null, data: { value: 'Hello!' } } },
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
    expected: { err: { code: '1', msg: 'not an error' } }
  }
].forEach(scenario => {
  test(`test getFile ${scenario.src}`, async () => {
    const options = {
      bucket: 'test',
      projectId: '12345',
      path: 'somepath'
    };
    const client = new gs(options);
    const operation = () =>
      client[scenario.src.match(/\.json$/) ? 'getJson' : 'getFile'](
        scenario.src,
        false
      );

    if (scenario.expected.err) {
      return expect(operation()).rejects.toEqual(scenario.expected.err);
    } else {
      return expect(operation()).resolves.toEqual(scenario.expected.data);
    }
  });
});

test('test getFile force mode', async () => {
  const options = {
    bucket: 'test',
    projectId: '12345',
    path: 'somepath'
  };
  const client = new gs(options);

  const data1 = await client.getFile('path/to-mutable.txt', false);
  const data2 = await client.getFile('path/to-mutable.txt');
  const data3 = await client.getFile('path/to-mutable.txt', true);

  expect(data1).toBe(data2);
  expect(data3).not.toBe(data1);
});

test('test getJson force mode', async () => {
  const options = {
    bucket: 'test',
    projectId: '12345',
    path: 'somepath'
  };
  const client = new gs(options);

  const data1 = await client.getJson('path/to-mutable.json', false);
  const data2 = await client.getJson('path/to-mutable.json');
  const data3 = await client.getJson('path/to-mutable.json', true);

  expect(data1.value).toBe(data2.value);
  expect(data3.value).not.toBe(data1.value);
});

[
  // TODO: investigate why this scenario fails
  // { path: 'components/', expected: ['image/1.0.0', 'image/1.0.1'] },
  { path: 'components/image', expected: ['1.0.0', '1.0.1'] },
  { path: 'components/image/', expected: ['1.0.0', '1.0.1'] }
].forEach(scenario => {
  test(`test listSubDirectories when bucket is not empty for folder ${scenario.path}`, async () => {
    const client = new gs({ bucket: 'my-bucket' });

    const data = await client.listSubDirectories(scenario.path);

    expect(data).toEqual(scenario.expected);
  });
});

['hello', 'path/'].forEach(scenario => {
  test(`test listSubDirectories when bucket is empty for folder ${scenario}`, () => {
    const client = new gs({ bucket: 'my-empty-bucket' });

    return expect(client.listSubDirectories(scenario)).rejects.toEqual({
      code: 'dir_not_found',
      msg: `Directory "${scenario}" not found`
    });
  });
});

test('test getUrl ', () => {
  const client = new gs({ path: '/' });
  expect(client.getUrl('test', '1.0.0', 'test.js')).toBe('/test/1.0.0/test.js');
});

test('test put dir (failure)', () => {
  const client = new gs({ bucket: 'my-bucket' });

  return expect(
    client.putDir(
      '/absolute-path-to-dir',
      'components\\componentName-error\\1.0.0'
    )
  ).rejects.toThrow('ENOENT');
});

test('test put dir ', () => {
  const client = new gs({ bucket: 'my-bucket' });

  return expect(
    client.putDir('/absolute-path-to-dir', 'components\\componentName\\1.0.0')
  ).rejects.toThrow('ENOENT');
});

test('test private putFileContent ', async () => {
  const client = new gs({ bucket: 'my-bucket' });

  const data = await client.putFileContent('words', 'filename.js', true);

  expect(data.ACL).toBe('authenticated-read');
});

test('test public putFileContent ', async () => {
  const client = new gs({ bucket: 'my-bucket' });

  const data = await client.putFileContent('words', 'filename.gz', false);

  expect(data.ACL).toBe('public-read');
});

test('put a js file ', async () => {
  const client = new gs({ bucket: 'my-bucket' });

  const data = await client.putFile('../path', 'hello.js', false);

  expect(data.ContentType).toBe('application/javascript');
});

test('put a gzipped js file ', async () => {
  const client = new gs({ bucket: 'my-bucket' });

  const data = await client.putFile('../path', 'hello.js.gz', false);

  expect(data.ContentType).toBe('application/javascript');
  expect(data.ContentEncoding).toBe('gzip');
});

test('put a css file ', async () => {
  const client = new gs({ bucket: 'my-bucket' });

  const data = await client.putFile('../path', 'hello.css', false);

  expect(data.ContentType).toBe('text/css');
});

test('put a gzipped css file ', async () => {
  const client = new gs({ bucket: 'my-bucket' });

  const data = await client.putFile('../path', 'hello.css.gz', false);

  expect(data.ContentType).toBe('text/css');
  expect(data.ContentEncoding).toBe('gzip');
});

test('put a jpg file ', async () => {
  const client = new gs({ bucket: 'my-bucket' });

  const data = await client.putFile('../path', 'hello.jpg', false);

  expect(data.ContentType).toBe('image/jpeg');
});

test('put a gif file ', async () => {
  const client = new gs({ bucket: 'my-bucket' });

  const data = await client.putFile('../path', 'hello.gif', false);

  expect(data.ContentType).toBe('image/gif');
});

test('put a png file ', async () => {
  const client = new gs({ bucket: 'my-bucket' });

  const data = await client.putFile('../path', 'hello.png', false);

  expect(data.ContentType).toBe('image/png');
});
