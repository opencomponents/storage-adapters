# Description
Allows oc registry to store its components within Azure Blob Storage.

# Configuration
```javascript
var azureStorageAdapter = require('oc-azure-storage-adapter');
...
storage: {
  adapter: azureStorageAdapter,
  options: {
    // Container that will store publicly available files. 
    // It's ACL should be set to 'blob' ({ "publicAccess": "blob" })
    publicContainerName: 'oc-public',
    // Container that will store private files. 
    // It's ACL should be set to 'Private' ({ "publicAccess": "off" })
    privateContainerName: 'oc-private',
    accountName: '<your_azure_account_name>',
    accountKey: '<your_very_secret_azure_account_key>',
    path: '//<your_azure_account_name>.blob.core.windows.net/<publicContainerName>/',
    componentsDir: 'components',
  }
}
...
```

# Differences vs S3 adapter
This adapter is based on the S3 adapter, however there's significant difference in how Azure and S3 handle permissions for storage file, which resulted in few workarounds that are described below

## Permissions issue
Azure Blob Storage handles ACL in a different way than S3 - it does not allow setting permissions per file/blob, but rather per container (something containing multiple blobs).

To that extent we will need to create 2 containers in Azure, one for public files and one for private files.

The only problem with that approach is the fact that oc informs storage adapter if the file is public or private only when writing, but not when reading a file - so we would not know from which container to read the file. While we could extend oc to do that, in order to get something working and then iterate on it I've opted in for a workaround:

* When we ask azure-storage-adapter to read a file we always read it from private container
* When we write a private file we write it to private container
* When we write a public file we write it to both private and public container

This way we can ensure azure-storage-adapter will be compatible with oc storage-adapter api and we do not have to modify oc itself.

## File streams issue
Implementing workaround/hack for the private/public file permissions have had a side effect when putting file content when content is provided as a stream.

After we have written the stream to private container, the stream is at its end. I have not been able to figure out how to reset this stream to beginning for writes to public container, I've tried the following:
* use fs.read with empty buffer, read length of 0 and position set to 0 in an attempt to reset the stream
  * this had no effect on stream whatsoever
* pipe through azure write stream
  * as one could expect azure write stream is not pass-through, so any further reads would basically hang

In order to be able to write the actual content to public container after using up original stream with file content, I set up additional stream from azure private container to azure public container. Even though it puts ugly and unnecessary strain on the network I opted in to do this because:
* I couldn't solve original issue
* I did not want to load files into memory, that would put unnecessary memory pressure on registry and I think it could potentially block event loop

# Follow up work
* Solve streams in a nicer way / modify oc to provide acl type for files when reading them
* Extract azure helper functions into separate file, we could then test them separately from the adapter itself
