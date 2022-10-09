export { getFileInfo } from './get-file-info';
export { getMimeType } from './get-mime-type';
export { getNextYear } from './get-next-year';
export * as strings from './strings';

type Callback<Data = unknown, E = Error> = (err: E | null, data: Data) => void;

export interface StorageAdapter {
  adapterType: string;
  getFile: {
    (filePath: string, cb: Callback<string>): void;
    (filePath: string): Promise<string>;
  };
  getJson: {
    <T = unknown>(
      filePath: string,
      force: boolean,
      cb: Callback<T, string>
    ): void;
    <T = unknown>(filePath: string, force: boolean): Promise<T>;
    <T = unknown>(filePath: string, cb: Callback<T, string>): void;
    <T = unknown>(filePath: string): Promise<T>;
  };
  getUrl: (componentName: string, version: string, fileName: string) => string;
  listSubDirectories: {
    (dir: string, cb: Callback<string[], Error & { code?: string }>): void;
    (dir: string): Promise<string[]>;
  };
  maxConcurrentRequests: number;
  putDir: {
    (folderPath: string, filePath: string, cb: Callback): void;
    (folderPath: string, filePath: string): Promise<unknown>;
  };
  putFile: {
    (
      filePath: string,
      fileName: string,
      isPrivate: boolean,
      callback: Callback<unknown, string>
    ): void;
    (filePath: string, fileName: string, isPrivate: boolean): Promise<unknown>;
  };
  putFileContent: {
    (
      data: unknown,
      path: string,
      isPrivate: boolean,
      callback: Callback<unknown, string>
    ): void;
    (data: unknown, path: string, isPrivate: boolean): Promise<unknown>;
  };
}
