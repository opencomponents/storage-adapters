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

export = utils;
