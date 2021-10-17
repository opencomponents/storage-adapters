type Callback<Data = unknown, E = Error> = (err: E | null, data: Data) => void;

declare const utils: {
  getNextYear: () => Date;
  getFileInfo: (filePath: string) => {
    gzip: boolean;
    extname: string;
    mimeType: string | undefined;
  };
  strings: {
    errors: {
      generic: string;
      STORAGE: {
        DIR_NOT_FOUND: string;
        DIR_NOT_FOUND_CODE: string;
        FILE_NOT_FOUND: string;
        FILE_NOT_FOUND_CODE: string;
        FILE_NOT_VALID: string;
        FILE_NOT_VALID_CODE: string;
      };
    };
  };
  getMimeType: (extension: string) => string | undefined;
};

export interface StorageAdapter {
  adapterType: string;
  getFile: {
    (filePath: string, cb: Callback<string>): void;
    (filePath: string): Promise<string>;
  };
  getJson: {
    <T = unknown>(filePath: string, force: boolean, cb: Callback<T, string>): void;
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
    (data: unknown, path: string, isPrivate: boolean, callback: Callback<unknown, string>): void;
    (data: unknown, path: string, isPrivate: boolean): Promise<unknown>;
  };
}

export default utils;
