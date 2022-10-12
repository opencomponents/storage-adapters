const { fromPromise } = require('universalify');
const s3 = require('../lib');

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
