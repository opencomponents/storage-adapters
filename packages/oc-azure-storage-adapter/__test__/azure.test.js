const Readable = require('stream').Readable;
const { fromPromise } = require('universalify');
const azure = require('../lib');

//Mock Date functions
const DATE_TO_USE = new Date('2017');
const _Date = Date;
global.Date = jest.fn(() => DATE_TO_USE);
global.Date.UTC = _Date.UTC;
global.Date.parse = _Date.parse;
global.Date.now = _Date.now;

test('should expose the correct methods', () => {
  const options = {
    publicContainerName: 'pubcon',
    privateContainerName: 'privcon'
  };
  const client = new azure(options);

  [
    { method: 'adapterType', value: 'azure-blob-storage' },
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

test('validate valid conf without credentials', () => {
  const options = {
    publicContainerName: 'pubcon',
    privateContainerName: 'privcon'
  };
  const client = new azure(options);
  expect(client.isValid()).toBe(true);
});

test('validate valid conf with credentials', () => {
  const options = {
    publicContainerName: 'pubcon',
    privateContainerName: 'privcon',
    accountName: 'acc',
    accountKey: 'accKey'
  };
  const client = new azure(options);
  expect(client.isValid()).toBe(true);
});

test('validate missing public container', () => {
  const options = {
    privateContainerName: 'privcon'
  };
  const client = new azure(options);
  expect(client.isValid()).toBe(false);
});

test('validate missing private container', () => {
  const options = {
    publicContainerName: 'pubcon'
  };
  const client = new azure(options);
  expect(client.isValid()).toBe(false);
});

test('validate partial credentials, no key', () => {
  const options = {
    publicContainerName: 'pubcon',
    privateContainerName: 'privcon',
    accountName: 'acc'
  };
  const client = new azure(options);
  expect(client.isValid()).toBe(false);
});

test('validate partial credentials, no name', () => {
  const options = {
    publicContainerName: 'pubcon',
    privateContainerName: 'privcon',
    accountKey: 'accKey'
  };
  const client = new azure(options);
  expect(client.isValid()).toBe(false);
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
      publicContainerName: 'pubcon',
      privateContainerName: 'privcon'
    };
    const client = new azure(options);

    fromPromise(client[scenario.src.match(/\.json$/) ? 'getJson' : 'getFile'])(
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
    publicContainerName: 'pubcon',
    privateContainerName: 'privcon'
  };

  const client = new azure(options);
  const getFile = fromPromise(client.getFile);

  getFile('path/to-mutable.txt', false, (err1, data1) => {
    getFile('path/to-mutable.txt', (err2, data2) => {
      getFile('path/to-mutable.txt', true, (err3, data3) => {
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
    publicContainerName: 'pubcon',
    privateContainerName: 'privcon'
  };

  const client = new azure(options);
  const getJson = fromPromise(client.getJson);

  getJson('path/to-mutable.json', false, (err1, data1) => {
    getJson('path/to-mutable.json', (err2, data2) => {
      getJson('path/to-mutable.json', true, (err3, data3) => {
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
  { path: 'components/', expected: ['image'] },
  { path: 'components/image', expected: ['1.0.0', '1.0.1'] },
  { path: 'components/image/', expected: ['1.0.0', '1.0.1'] },
  { path: 'components/image/1.0.0/', expected: [] }
].forEach(scenario => {
  test(`test listObjects when bucket is not empty for folder ${scenario.path}`, done => {
    const client = new azure({
      publicContainerName: 'pubcon',
      privateContainerName: 'privcon'
    });

    fromPromise(client.listSubDirectories)(scenario.path, (err, data) => {
      expect(err).toBeFalsy();
      expect(data).toEqual(scenario.expected);
      done();
    });
  });
});

['hello', 'path/'].forEach(scenario => {
  test(`test listObjects when bucket is empty for folder ${scenario}`, done => {
    const client = new azure({
      publicContainerName: 'my-empty-container',
      privateContainerName: 'my-empty-container'
    });

    fromPromise(client.listSubDirectories)(scenario, (err, data) => {
      expect(data).toEqual([]);
      done();
    });
  });
});

test('test getUrl ', () => {
  const client = new azure({ path: '/' });
  expect(client.getUrl('test', '1.0.0', 'test.js')).toBe('/test/1.0.0/test.js');
});

test('test put dir (failure)', done => {
  const client = new azure({
    publicContainerName: 'pubcon',
    privateContainerName: 'privcon'
  });

  fromPromise(client.putDir)(
    '/absolute-path-to-dir',
    'components\\componentName-error\\1.0.0',
    (err, res) => {
      expect(res).toBeUndefined();
      expect(err).toEqual({
        msg: 'sorry'
      });
      done();
    }
  );
});

test('test put dir (stream failure throwing)', done => {
  const client = new azure({
    publicContainerName: 'pubcon',
    privateContainerName: 'privcon'
  });

  fromPromise(client.putDir)(
    '/absolute-path-to-dir',
    'components\\componentName-error-throw\\1.0.0',
    (err, res) => {
      expect(res).toBeUndefined();
      expect(err.msg).toContain('sorry');
      done();
    }
  );
});

test('test private putFileContent', done => {
  const client = new azure({
    publicContainerName: 'pubcon',
    privateContainerName: 'privcon'
  });

  fromPromise(client.putFileContent)(
    'words',
    'filename.js',
    true,
    (err, result) => {
      expect(err).toBeFalsy();
      expect(result.container).toBe('privcon');
      done();
    }
  );
});

test('test private putFileContent stream', done => {
  const client = new azure({
    publicContainerName: 'pubcon',
    privateContainerName: 'privcon'
  });

  const fileContent = 'words';
  const fileStream = new Readable();
  fileStream.push(fileContent);
  fileStream.push(null);

  fromPromise(client.putFileContent)(
    fileStream,
    'filename.js',
    true,
    (err, result) => {
      expect(err).toBeFalsy();
      expect(result.container).toBe('privcon');
      expect(result.lengthWritten).toBe(fileContent.length);
      expect(result.settings.blobHTTPHeaders.blobCacheControl).toBe(
        'public, max-age=31556926'
      );
      done();
    }
  );
});

test('test public putFileContent', done => {
  const client = new azure({
    publicContainerName: 'pubcon',
    privateContainerName: 'privcon'
  });

  fromPromise(client.putFileContent)(
    'words',
    'filename.gz',
    false,
    (err, result) => {
      expect(err).toBeFalsy();
      expect(result.container).toBe('pubcon');
      done();
    }
  );
});

test('test public putFileContent stream', done => {
  const client = new azure({
    publicContainerName: 'pubcon',
    privateContainerName: 'privcon'
  });

  const fileContent = 'words';
  const fileStream = new Readable();
  fileStream.push(fileContent);
  fileStream.push(null);

  fromPromise(client.putFileContent)(
    fileStream,
    'filename.js',
    false,
    (err, result) => {
      expect(err).toBeFalsy();
      expect(result.container).toBe('pubcon');
      expect(result.lengthWritten).toBe(fileContent.length);
      done();
    }
  );
});

test('put a js file ', done => {
  const client = new azure({
    publicContainerName: 'pubcon',
    privateContainerName: 'privcon'
  });

  fromPromise(client.putFile)('../path', 'hello.js', false, err => {
    expect(err).toBeFalsy();
    done();
  });
});
