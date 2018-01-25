# RiakCS as registry storage

`⚠️ THIS ADAPTER IS IN ACTIVE DEVELOPMENT, DON'T USE IN PRODUCTION`

RiakCS is a S3 compliant object storage, based on the distributed database Riak by Basho. In other words in case AWS S3 isn't an option RiakCS may be an alternative to run the storage in-house or locally as a developer.

## Installing RiakCS locally

If you want to try it out locally, start with installing RiakCS using docker.

To run and start three buckets, do the following (check https://github.com/ianbytchek/docker-riak-cs for further info):

```
docker run --env 'RIAK_CS_BUCKETS=foo,bar,baz' --publish '8080:8080' --name 'riak-cs' ianbytchek/riak-cs
```

To be able to connect to the S3 storage we need to get the access key and secret key. You will find this in the RiakCS log. To start with, get the docker containerid for the container that we named _riak-cs_:

```
docker ps
```

After RiakCS has started, which may take a minute or two, the keys will show up in the log. 

```
docker logs <containerid>
```

## Starting a registry

Make sure you have installed the _oc_ package and the storage adapter.

```
npm install -g oc
npm install oc-riak-storage-adapter
```

Create an _index.js_ file and add the access key and secret key to the snippet below.

```
'use strict';
const oc = require('oc');
const riak = require('oc-riak-storage-adapter');

let configuration = {
  verbosity: 5,
  baseUrl: 'http://localhost:3333',
  port: 3333,
  tempDir: './temp/',
  refreshInterval: 600,
  pollingInterval: 5,
  storage: {
    adapter: riak,
    options: {
      key: '<ACCESS KEY>',
      secret: '<SECRET KEY>',
      bucket: 'foo',
      region: 'us-east-1',
      componentsDir: 'components',
      signatureVersion: 'v2',       // Use v2 for RiakCS
      sslEnabled: false,
      path: '//localhost:8080/foo/', 
      s3ForcePathStyle: true,       // Necessary to get the path right
      debug: true,                  // Log what AWS is up to to stdout 
      // Override endpoint, this is passed straight to AWS.Endpoint constructor - https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Endpoint.html 
      endpoint: {
        protocol: 'http',
        hostname: 'localhost',
        port: '8080'
      }  
    }    
  },
  env: { name: 'production' }
};

let registry = new oc.Registry(configuration);

registry.start(function(err, app){
  if(err) {
    console.log('Registry not started: ', err);
    process.exit(1);
  }
});
```

Now start the registry:

```
node index.js
```

The registry should be now be exposed on http://localhost:3333/.

To add the registry config run: 

```
oc registry add http://localhost:3333/
``` 

## Publish a component

To publish a component to the registry run

```
oc publish my-component/
```

Now the component should be available at http://localhost:3333/my-component.


## Troubleshooting

If you run into trouble when accessing RiakCS the `s3cmd` can be a helpful companion. Install using _pip_, _homebrew_ any other appropriate tool. See also https://github.com/s3tools/s3cmd/blob/master/INSTALL.

Create a file named `s3.cfg` and add the following snippet with your own key and secret:

```
[default]
access_key = <AWS KEY>
host_base = localhost:8080
host_bucket = foo
secret_key = <AWS SECRET>
signature_v2 = True
```

For example to list objects

`s3cmd -c s3.cfg --no-ssl setacl --acl-public s3://foo/storage/components-details.json`

# License

MIT

