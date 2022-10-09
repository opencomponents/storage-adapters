const adapter = require('../lib');

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
  const client = new adapter({
    publicContainerName: 'pubcon',
    privateContainerName: 'privcon'
  });

  client.putDir('.', '.', (_, mockResult) => {
    const separators = ['\\', '/'];
    for (let separator of separators) {
      expect(mockResult[`.${separator}server.js`].res.container).toBe(
        'privcon'
      );
      expect(mockResult[`.${separator}.env`].res.container).toBe('privcon');
      expect(mockResult[`.${separator}package.json`].res.container).toBe(
        'pubcon'
      );
      expect(mockResult[`.${separator}template.js`].res.container).toBe(
        'pubcon'
      );
    }

    done();
  });
});
