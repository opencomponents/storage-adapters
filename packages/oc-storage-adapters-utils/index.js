const getFileInfo = require('./lib/get-file-info');
const getNextYear = require('./lib/get-next-year');
const getMimeType = require('./lib/get-mime-type');
const strings = require('./lib/strings');
module.exports = {
  getNextYear,
  getFileInfo,
  strings,
  getMimeType
};
