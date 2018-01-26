'use strict';
jest.dontMock('aws-sdk');
const s3 = require('../');
const domain = 'domain.net';

test('Validate endpoint with default settings', () => {
  const options = {
    bucket: 'test',
    region: 'region-test',
    key: 'test-key',
    secret: 'test-secret'
  };
  const config = new s3(options).getConfig().config;
  const expectedEndpoint = 's3.' + options.region + '.amazonaws.com';
  expect(config.endpoint).toEqual(expectedEndpoint);
});

test('Validate endpoint when configured with just domain name', () => {
  const options = {
    bucket: 'test',
    region: 'region-test',
    key: 'test-key',
    secret: 'test-secret',
    endpoint: domain
  };
  const config = new s3(options).getConfig().config;
  const expectedEndpoint = {
    host: domain,
    hostname: domain,
    href: 'https://' + domain + '/',
    path: '/',
    pathname: '/',
    port: 443,
    protocol: 'https:'
  };
  expect(config.endpoint).toEqual(expectedEndpoint);
});

test('Validate endpoint to use https by default', () => {
  const options = {
    bucket: 'test',
    region: 'region-test',
    key: 'test-key',
    secret: 'test-secret',
    endpoint: domain
  };
  const config = new s3(options).getConfig().config;
  const expectedEndpoint = {
    host: domain,
    hostname: domain,
    href: 'https://' + domain + '/',
    path: '/',
    pathname: '/',
    port: 443,
    protocol: 'https:'
  };
  expect(config.endpoint).toEqual(expectedEndpoint);
});

test('Validate endpoint when configured with http protocol', () => {
  const options = {
    bucket: 'test',
    region: 'region-test',
    key: 'test-key',
    secret: 'test-secret',
    endpoint: 'http://' + domain
  };
  const config = new s3(options).getConfig().config;
  const expectedEndpoint = {
    host: domain,
    hostname: domain,
    href: 'http://' + domain + '/',
    path: '/',
    pathname: '/',
    port: 80,
    protocol: 'http:'
  };
  expect(config.endpoint).toEqual(expectedEndpoint);
});

test('Validate endpoint when configured with port', () => {
  const options = {
    bucket: 'test',
    region: 'region-test',
    key: 'test-key',
    secret: 'test-secret',
    endpoint: domain + ':1234'
  };
  const config = new s3(options).getConfig().config;
  const expectedEndpoint = {
    host: domain + ':1234',
    hostname: domain,
    href: 'https://' + domain + ':1234/',
    path: '/',
    pathname: '/',
    port: 1234,
    protocol: 'https:'
  };
  expect(config.endpoint).toEqual(expectedEndpoint);
});
