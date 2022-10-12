const gs = require('../lib');
const { fromPromise } = require('universalify');

jest.mock('node-dir', () => {
  return {
    paths: jest.fn((pathToDir, cb) => {
      cb(null, {
        files: [
          `${pathToDir}\\package.json`,
          `${pathToDir}\\server.js`,
          `${pathToDir}\\.env`,
          `${pathToDir}\\template.js`,
          `${pathToDir}/package.json`,
          `${pathToDir}/server.js`,
          `${pathToDir}/.env`,
          `${pathToDir}/template.js`
        ]
      });
    })
  };
});

jest.mock('async', () => {
  return {
    each: jest.fn((files, fileProcessing, cb) => {
      const result = {};
      let noProcessed = 0;
      for (let file of files) {
        fileProcessing(file, (err, res) => {
          result[file] = { err, res };
          noProcessed++;
          if (noProcessed === files.length) cb(null, result);
        });
      }
    })
  };
});

test('put directory recognizes server.js and .env to be private', done => {
  const options = {
    bucket: 'test',
    projectId: '12345',
    path: 'somepath'
  };
  const client = new gs(options);

  fromPromise(client.putDir)('.', '.', (_, mockResult) => {
    const serverMock = mockResult.find(x => x.Key === `./server.js`);
    const envMock = mockResult.find(x => x.Key === './.env');
    const packageMock = mockResult.find(x => x.Key === './package.json');
    const templateMock = mockResult.find(x => x.Key === './template.js');

    expect(serverMock.ACL).toBe('authenticated-read');
    expect(envMock.ACL).toBe('authenticated-read');
    expect(packageMock.ACL).toBe('public-read');
    expect(templateMock.ACL).toBe('public-read');

    done();
  });
});
