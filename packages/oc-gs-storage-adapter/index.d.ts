type StorageAdapter = import('oc-storage-adapters-utils').StorageAdapter;

export interface GsConfig {
  bucket: string;
  projectId: string;
  path: string;
  maxAge?: boolean;
  verbosity?: boolean;
  refreshInterval?: number;
}

declare const adapter: (conf: GsConfig) => StorageAdapter;

export default adapter;
