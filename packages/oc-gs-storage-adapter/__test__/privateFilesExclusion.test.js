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

test('put directory recognizes server.js and .env to be private', async () => {
  const options = {
    bucket: 'test',
    projectId: '12345',
    path: 'somepath'
  };
  const client = new gs(options);

  const mockResult = await client.putDir('.', '.');
  const serverMock = mockResult.find(x => x.Key === `./server.js`);
  const envMock = mockResult.find(x => x.Key === './.env');
  const packageMock = mockResult.find(x => x.Key === './package.json');
  const templateMock = mockResult.find(x => x.Key === './template.js');

  expect(serverMock.ACL).toBe('authenticated-read');
  expect(envMock.ACL).toBe('authenticated-read');
  expect(packageMock.ACL).toBe('public-read');
  expect(templateMock.ACL).toBe('public-read');
});
