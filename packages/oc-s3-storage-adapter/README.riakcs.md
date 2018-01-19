
When using RiakCS as a S3 compliant object storage, one has to use some specific configurations. 

If you want to try it out locally, start with installing RiakCS locally using docker.


Run and start three buckets. Check https://github.com/ianbytchek/docker-riak-cs for further info.

```
docker run --detach \
    --env 'RIAK_CS_BUCKETS=foo,bar,baz' \
    --publish '8080:8080' \
    --name 'riak-cs' \
    ianbytchek/riak-cs
```

Get the docker containerid for the container with name _riak-cs_:

```
docker ps
```

Get the AWS key and secret by checking the head of the log of the container.

```
docker logs <containerid>
```

Create an _index.js_ file and add the AWS key and secret.

```
"use strict";
const AWS = require('aws-sdk');
const oc = require('oc');

var configuration = {
  verbosity: 1,
  baseUrl: 'http://localhost',
  port: 3333,
  tempDir: './temp/',
  refreshInterval: 600,
  pollingInterval: 5,
  storage: {
    options: {
      key: '<AWS KEY>',
      secret: '<AWS SECRET>',
      bucket: 'foo',
      region: 'us-east-1',
      componentsDir: 'storage',
      signatureVersion: 'v2',       // Use v2 for RiakCS
      sslEnabled: false,
      path: '//localhost:8080/foo', 
      s3ForcePathStyle: true,       // Necessary to get the path right
      debug: true,                  // Log what AWS is up to to stdout 
      // Override endpoint, this is passed straight to AWS.Endpoint constructor - https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Endpoint.html 
      endpoint: {
        protocol: 'http',
        hostname: 'localhost',
        port: '8080',
        href: 'http://localhost:8080/'
      }  
    }    
  },
  env: { name: 'production' }
};

var registry = new oc.Registry(configuration);

  registry.start(function(err, app){
    if(err) {
      console.log('Registry not started: ', err);
      process.exit(1);
    }
  });
```


Run and check that the registry is working:

```
node index.js
```

