type StorageAdapter = import('oc-storage-adapters-utils').StorageAdapter;

type RequireAllOrNone<ObjectType, KeysType extends keyof ObjectType = never> = (
  | Required<Pick<ObjectType, KeysType>> // Require all of the given keys.
  | Partial<Record<KeysType, never>> // Require none of the given keys.
) &
  Omit<ObjectType, KeysType>; // The rest of the keys.

export type AzureConfig = RequireAllOrNone<
  {
    accountKey: string;
    accountName: string;
    publicContainerName: string;
    privateContainerName: string;
    path: string;
    verbosity?: boolean;
    refreshInterval?: number;
  },
  'accountKey' | 'accountName'
>;

declare const adapter: (conf: AzureConfig) => StorageAdapter;

export default adapter;
