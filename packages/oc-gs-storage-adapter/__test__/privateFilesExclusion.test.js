const gs = require('../lib');

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

  client.putDir('.', '.', (_, mockResult) => {
    const separators = ['\\', '/'];
    for (let separator of separators) {
      expect(mockResult[`.${separator}server.js`].res.ACL).toBe(
        'authenticated-read'
      );
      expect(mockResult[`.${separator}.env`].res.ACL).toBe(
        'authenticated-read'
      );
      expect(mockResult[`.${separator}package.json`].res.ACL).toBe(
        'public-read'
      );
      expect(mockResult[`.${separator}template.js`].res.ACL).toBe(
        'public-read'
      );
    }

    done();
  });
});
