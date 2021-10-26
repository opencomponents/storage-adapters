const s3 = require('../');

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
    region: 'region-test',
    key: 'test-key',
    secret: 'test-secret'
  };

  const client = new s3(options);

  client.putDir('.', '.', (_, mockResult) => {
    const separators = ['\\', '/'];
    for (let separator of separators) {
      expect(mockResult[`.${separator}.env`].res.ACL).toBe(
        'authenticated-read'
      );
      expect(mockResult[`.${separator}server.js`].res.ACL).toBe(
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
