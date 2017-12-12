'use strict';
const gs = require('../');

//Mock Date functions
const DATE_TO_USE = new Date('2017');
const _Date = Date;
global.Date = jest.fn(() => DATE_TO_USE);
global.Date.UTC = _Date.UTC;
global.Date.parse = _Date.parse;
global.Date.now = _Date.now;

jest.mock('fs-extra', () => {
  return {
    createReadStream: jest.fn(() => 'this is a stream'),
    writeFileSync: jest.fn(() => 'write file'),
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
jest.mock('@google-cloud/storage', () =>
  jest.fn(() => ({
    bucket: bucket => ({
      getFiles: () => {
        const CommonPrefixes =
          bucket === 'my-empty-bucket'
            ? []
            : [
              {
                Prefix: 'components/image/1.0.0/'
              },
              {
                Prefix: 'components/image/1.0.1/'
              }
            ];
        return new Promise((resolve, reject) => {
          process.nextTick(() => resolve(CommonPrefixes));
        });
      },
      upload: () => {
        return new Promise((resolve, reject) => {
          process.nextTick(() => resolve());
        });
      },
      file: file => ({
        download: () => {
          mockCachedTxt++;
          mockCachedJson++;
          const contents = {
            'path/test.txt': 'Hello!',
            'path/test.json': JSON.stringify({ value: 'Hello!' }),
            'path/not-found.txt': { error: { code: 'NoSuchKey' } },
            'path/not-found.json': { error: { code: 'NoSuchKey' } },
            'path/not-a-json.json': {
              error: { code: '1', msg: 'not an error' }
            },
            'path/to-mutable.json': {
              content: JSON.stringify({ value: mockCachedJson })
            },
            'path/to-mutable.txt': { content: mockCachedTxt }
          };
          const content = contents[file];
          if (content.error) {
            return new Promise((resolve, reject) => {
              process.nextTick(() => reject({ code: 404 }));
            });
          } else {
            return new Promise((resolve, reject) => {
              process.nextTick(() => resolve(content));
            });
          }
        }
      })
    })
  }))
);

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

//Functions utilizing Google Storage
[
  { src: 'path/test.txt' },
  { src: 'path/test.json', json: true },
  { src: 'path/not-found.txt' },
  { src: 'path/not-found.json', json: true },
  { src: 'path/not-a-json.json', json: true }
].forEach(scenario => {
  test(`test getFile ${scenario.src}`, done => {
    const options = {
      bucket: 'test',
      projectId: '12345',
      path: 'somepath'
    };
    const client = new gs(options);

    client[scenario.json ? 'getJson' : 'getFile'](
      scenario.src,
      false,
      (err, data) => {
        expect(err).toMatchSnapshot();
        expect(data).toMatchSnapshot();
        done();
      }
    );
  });
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

[('components/', 'components/image', 'components/image/')].forEach(scenario => {
  test(`test listObjects when bucket is not empty for folder ${scenario}`, done => {
    const client = new gs({ bucket: 'my-bucket' });

    client.listSubDirectories(scenario, (err, data) => {
      expect(err).toMatchSnapshot();
      expect(data).toMatchSnapshot();
      done();
    });
  });
});

test('test getUrl ', () => {
  const client = new gs({ path: '/' });
  expect(client.getUrl('test', '1.0.0', 'test.js')).toMatchSnapshot();
});

test('test put dir (failure)', done => {
  const client = new gs({ bucket: 'my-bucket' });

  client.putDir(
    '/absolute-path-to-dir',
    'components\\componentName-error\\1.0.0',
    (err, res) => {
      expect(err).toMatchSnapshot();
      done();
    }
  );
});

test('test private putFileContent ', () => {
  const client = new gs({ bucket: 'my-bucket' });
  const cb = data => {
    expect(data).toMatchSnapshot();
  };

  client.putFileContent('words', 'filename.js', true, cb);
});

test('test public putFileContent ', () => {
  const client = new gs({ bucket: 'my-bucket' });
  const cb = data => {
    expect(data).toMatchSnapshot();
  };

  client.putFileContent('words', 'filename.gz', false, cb);
});

//todo not working
// test('test getFile force mode', done => {
//   const client = new gs({ bucket: 'my-bucket' });
//
//   client.getFile('path/to-mutable.txt', false, (err1, data1) => {
//     client.getFile('path/to-mutable.txt', (err2, data2) => {
//       client.getFile('path/to-mutable.txt', true, (err3, data3) => {
//         expect(err1).toBeNull;
//         expect(err2).toBeNull;
//         expect(err3).toBeNull;
//         expect(data1).toBe(data2);
//         expect(data3).not.toBe(data1);
//         done();
//       });
//     });
//   });
// });
//
// test('test getJson force mode', done => {
//   const client = new gs({ bucket: 'my-bucket' });
//
//   client.getJson('path/to-mutable.json', false, (err1, data1) => {
//     client.getJson('path/to-mutable.json', (err2, data2) => {
//       client.getJson('path/to-mutable.json', true, (err3, data3) => {
//         expect(err1).toBeNull;
//         expect(err2).toBeNull;
//         expect(err3).toBeNull;
//         expect(data1.value).toBe(data2.value);
//         expect(data3.value).not.toBe(data1.value);
//         done();
//       });
//     });
//   });
// });
