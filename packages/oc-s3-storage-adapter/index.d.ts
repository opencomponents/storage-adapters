type StorageAdapter = import('oc-storage-adapters-utils').StorageAdapter;
type httpAgent = import('http').Agent;
type httpsAgent = import('https').Agent;

type RequireAllOrNone<ObjectType, KeysType extends keyof ObjectType = never> = (
  | Required<Pick<ObjectType, KeysType>> // Require all of the given keys.
  | Partial<Record<KeysType, never>> // Require none of the given keys.
) &
  Omit<ObjectType, KeysType>; // The rest of the keys.

export type S3Config = RequireAllOrNone<
  {
    bucket: string;
    region: string;
    key?: string;
    secret?: string;
    path: string;
    sslEnabled?: boolean;
    s3ForcePathStyle?: boolean;
    signatureVersion?: string;
    timeout?: number;
    agentProxy?: httpAgent | httpsAgent;
    endpoint?: string;
    debug?: boolean;
    verbosity?: boolean;
    refreshInterval?: number;
  },
  'key' | 'secret'
>;

declare const adapter: (conf: S3Config) => StorageAdapter;

export default adapter;
