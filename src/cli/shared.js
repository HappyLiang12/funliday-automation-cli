const fs = require('fs');
const path = require('path');
const { DEFAULT_CDP_ENDPOINT } = require('../auth/browser-session');
const { readAuthFromEnv, readAuthFromFile } = require('../auth/env-auth');

function parseCommonFlags(argv) {
  const options = {
    endpoint: process.env.FUNLIDAY_CDP_ENDPOINT || DEFAULT_CDP_ENDPOINT,
    outputPath: '',
    authFile: '',
    useEnvAuth: false,
  };

  const rest = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--endpoint') {
      options.endpoint = argv[index + 1] || options.endpoint;
      index += 1;
      continue;
    }
    if (arg === '--output') {
      options.outputPath = argv[index + 1] || options.outputPath;
      index += 1;
      continue;
    }
    if (arg === '--auth-file') {
      options.authFile = argv[index + 1] || options.authFile;
      index += 1;
      continue;
    }
    if (arg === '--env-auth') {
      options.useEnvAuth = true;
      continue;
    }
    rest.push(arg);
  }

  return { options, rest };
}

function resolveAuthInput(commonOptions) {
  if (commonOptions.authFile) return readAuthFromFile(commonOptions.authFile);
  if (commonOptions.useEnvAuth) return readAuthFromEnv();
  return null;
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
}

module.exports = {
  parseCommonFlags,
  resolveAuthInput,
  readJsonFile,
};

