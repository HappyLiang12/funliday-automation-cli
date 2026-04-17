const fs = require('fs');
const path = require('path');
const { FunlidayCliError } = require('../errors');

function normalizeAuth(input = {}) {
  const auth = {
    cookie: input.cookie || '',
    memberId: input.memberId || '',
    clientId: input.clientId || input.deviceId || '',
    deviceId: input.deviceId || input.clientId || '',
    accessToken: input.accessToken || '',
    poibankToken: input.poibankToken || '',
    webToken: input.webToken || '',
    language: input.language || process.env.FUNLIDAY_DEFAULT_LANGUAGE || 'zh_tw',
    authorization: input.authorization || '',
  };

  if (!auth.authorization) {
    if (auth.memberId && auth.accessToken) {
      auth.authorization = `Bearer ${auth.memberId}_${auth.accessToken}`;
    } else if (auth.webToken) {
      auth.authorization = `Bearer ${auth.webToken}`;
    }
  }

  return auth;
}

function readAuthFromEnv() {
  return normalizeAuth({
    cookie: process.env.FUNLIDAY_COOKIE,
    memberId: process.env.FUNLIDAY_MEMBER_ID,
    clientId: process.env.FUNLIDAY_CLIENT_ID,
    deviceId: process.env.FUNLIDAY_DEVICE_ID,
    accessToken: process.env.FUNLIDAY_ACCESS_TOKEN,
    poibankToken: process.env.FUNLIDAY_POIBANK_TOKEN,
    webToken: process.env.FUNLIDAY_WEB_TOKEN,
    authorization: process.env.FUNLIDAY_AUTHORIZATION,
    language: process.env.FUNLIDAY_DEFAULT_LANGUAGE,
  });
}

function readAuthFromFile(filePath) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new FunlidayCliError('AUTH_FILE_NOT_FOUND', `Auth file not found: ${resolved}`);
  }
  return normalizeAuth(JSON.parse(fs.readFileSync(resolved, 'utf8')));
}

module.exports = {
  normalizeAuth,
  readAuthFromEnv,
  readAuthFromFile,
};

