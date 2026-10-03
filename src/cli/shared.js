const fs = require('fs');
const path = require('path');
const { DEFAULT_CDP_ENDPOINT } = require('../auth/browser-session');
const { readAuthFromEnv, readAuthFromFile } = require('../auth/env-auth');
const { FunlidayCliError } = require('../errors');

function parseCommonFlags(argv) {
  const options = {
    endpoint: process.env.FUNLIDAY_CDP_ENDPOINT || DEFAULT_CDP_ENDPOINT,
    outputPath: '',
    authFile: '',
    useEnvAuth: false,
    quiet: false,
    debug: process.env.FUNLIDAY_DEBUG === '1',
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
    if (arg === '--quiet' || arg === '-q') {
      options.quiet = true;
      continue;
    }
    if (arg === '--debug') {
      options.debug = true;
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

function printCliSuccess(line, { quiet = false } = {}) {
  if (quiet) return;
  if (line) process.stdout.write(`${line}\n`);
}

function remediationFor(error) {
  if (!error || !error.code) return '';
  if (error.code === 'CDP_UNREACHABLE') {
    return 'Hint: start Chrome with `--remote-debugging-port=9333 --user-data-dir=<path>` and a non-default profile, then retry. See docs/auth_models.md.';
  }
  if (error.code === 'AUTH_REQUIRED' || error.code === 'AUTH_FILE_NOT_FOUND') {
    return 'Hint: pass `--auth-file <path>`, `--env-auth`, or run with browser-session auth (see docs/auth_models.md).';
  }
  if (error.code === 'AUTH_EXPIRED') {
    return 'Hint: re-export auth from a logged-in browser: `funliday-auth export --output ./funliday-auth.json` (then ship to your sandbox). See docs/agent_sandbox_setup.md.';
  }
  if (error.code === 'NOT_LOGGED_IN') {
    return 'Hint: visit https://www.funliday.com in the Chrome profile the CLI attached to and log in, then retry.';
  }
  if (error.code === 'POIBANK_ACCESS_UPGRADE_REQUIRED') {
    return 'Hint: real POI data is unavailable with a web-session poibank token (placeholder rows). Use trip-based endpoints instead of poibank search.';
  }
  if (error.code === 'FUNLIDAY_API_ERROR') {
    const message = String(error.message || '');
    if (/ErrorCodeUnknown/.test(message)) {
      return 'Hint: this endpoint may need `parseTripObjectId` instead of `tripId`. See docs/public_api.md "funliday-api body shapes".';
    }
  }
  return '';
}

function printCliError(error, { debug = false } = {}) {
  if (!error) return;
  const isCli = error instanceof FunlidayCliError || (error && error.name === 'FunlidayCliError');
  if (isCli && !debug) {
    process.stderr.write(`Error [${error.code || 'UNKNOWN'}]: ${error.message}\n`);
    const hint = remediationFor(error);
    if (hint) process.stderr.write(`${hint}\n`);
    return;
  }
  if (!debug && error && error.message) {
    process.stderr.write(`Error: ${error.message}\n`);
    return;
  }
  process.stderr.write(`${error && error.stack ? error.stack : String(error)}\n`);
}

function debugFromArgv(argv) {
  return Array.isArray(argv) && (argv.includes('--debug') || process.env.FUNLIDAY_DEBUG === '1');
}

module.exports = {
  parseCommonFlags,
  resolveAuthInput,
  readJsonFile,
  printCliSuccess,
  printCliError,
  remediationFor,
  debugFromArgv,
};
