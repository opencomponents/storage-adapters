const { fromPromise } = require('universalify');
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

  fromPromise(client.putDir)('.', '.', (_, mockResult) => {
    const serverMock = mockResult.find(x => x.fileName === `./server.js`);
    const envMock = mockResult.find(x => x.fileName === './.env');
    const packageMock = mockResult.find(x => x.fileName === './package.json');
    const templateMock = mockResult.find(x => x.fileName === './template.js');

    expect(serverMock.container).toBe('privcon');
    expect(envMock.container).toBe('privcon');
    expect(packageMock.container).toBe('pubcon');
    expect(templateMock.container).toBe('pubcon');

    done();
  });
});
