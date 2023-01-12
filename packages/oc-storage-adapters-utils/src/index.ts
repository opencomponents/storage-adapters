export { getFileInfo } from './get-file-info';
export { getMimeType } from './get-mime-type';
export { getNextYear } from './get-next-year';
export * as strings from './strings';

export interface StorageAdapterBaseConfig {
  componentsDir: string;
  path: string;
  verbosity?: boolean;
  refreshInterval?: number;
}

export interface StorageAdapter {
  adapterType: string;
  getFile(filePath: string, force?: boolean): Promise<string>;
  getJson<T = unknown>(filePath: string, force?: boolean): Promise<T>;
  getUrl: (componentName: string, version: string, fileName: string) => string;
  listSubDirectories(dir: string): Promise<string[]>;
  maxConcurrentRequests: number;
  putFile(
    filePath: string,
    fileName: string,
    isPrivate: boolean
  ): Promise<unknown>;
  putFileContent(
    data: unknown,
    path: string,
    isPrivate: boolean
  ): Promise<unknown>;
  isValid: () => boolean;
}
