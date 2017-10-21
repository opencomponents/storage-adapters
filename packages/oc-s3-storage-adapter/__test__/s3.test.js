const s3 = require('../');

const options = {
  bucket: 'test',
  region: 'region-test',
  key: 'test-key',
  secret: 'test-secret'
};

test('validate valid conf', () => {
  const client = new s3(options);
  expect(client.isValid()).toBe(true);
});

test('validate missing bucket conf', () => {
  const missingBucketOptions = options;
  missingBucketOptions.bucket = undefined;
  const client = new s3(missingBucketOptions);
  expect(client.isValid()).toBe(false);
});
