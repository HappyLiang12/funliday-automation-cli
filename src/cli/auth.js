const fs = require('fs');
const path = require('path');
const { ensureFunlidaySessionPage, extractFunlidayAuth, DEFAULT_CDP_ENDPOINT } = require('../auth/browser-session');
const { callFunlidayApi } = require('../api/client');
const { resolveArtifactPath, writeJson } = require('../io/paths');
const { parseCommonFlags, resolveAuthInput, printCliSuccess } = require('./shared');
const { FunlidayCliError } = require('../errors');

const DEFAULT_EXPORT_PATH = './funliday-auth.json';

function printAuthUsage() {
  console.log(`Funliday Auth CLI\n\nUsage:\n  funliday-auth export [--output <file>] [--include-cookie all|fld|none] [--include-tokens] [--print] [--endpoint <url>]\n  funliday-auth check  [--auth-file <file> | --env-auth] [--endpoint <url>]\n\nflags:\n  --output FILE         where to write auth.json (default: ./funliday-auth.json)\n  --include-cookie MODE 'fld' (default; only fld-* cookies), 'all' (verbatim), or 'none' (omit cookie field)\n  --include-tokens      include raw memberId/accessToken/poibankToken/webToken (default: only authorization+cookie+deviceId+language)\n  --print               also write the JSON to stdout (for piping into a secret manager)\n  --redact              when used with --print, mask token values for safe inspection\n\nexport extracts a logged-in Funliday session from a Chrome instance running with --remote-debugging-port,\nand writes a self-contained auth.json that --auth-file or env-auth can consume in a sandboxed agent.\n\ncheck validates that whichever auth path you pick is currently valid by calling a cheap read-only endpoint.`);
}

function parseAuthArgs(argv) {
  const subcommand = argv[0];
  if (!subcommand || ['help', '--help', '-h'].includes(subcommand)) return { subcommand: 'help' };
  const { options: common, rest } = parseCommonFlags(argv.slice(1));
  const options = {
    subcommand,
    endpoint: common.endpoint || DEFAULT_CDP_ENDPOINT,
    outputPath: common.outputPath,
    authFile: common.authFile,
    useEnvAuth: common.useEnvAuth,
    quiet: common.quiet,
    debug: common.debug,
    includeCookie: 'fld',
    includeTokens: false,
    print: false,
    redact: false,
    tripId: '',
  };
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--include-cookie') {
      const value = rest[index + 1] || '';
      if (!['fld', 'all', 'none'].includes(value)) throw new Error("--include-cookie must be one of 'fld', 'all', 'none'.");
      options.includeCookie = value;
      index += 1;
      continue;
    }
    if (arg === '--include-tokens') { options.includeTokens = true; continue; }
    if (arg === '--print') { options.print = true; continue; }
    if (arg === '--redact') { options.redact = true; continue; }
    if (arg === '--trip-id') { options.tripId = rest[index + 1] || ''; index += 1; continue; }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function filterCookieValue(rawCookie, mode) {
  if (mode === 'none') return '';
  if (mode === 'all') return rawCookie || '';
  if (!rawCookie) return '';
  return rawCookie
    .split(/;\s*/)
    .filter((piece) => /^fld-/.test(piece))
    .join('; ');
}

function buildExportShape(auth, { includeCookie, includeTokens }) {
  const filteredCookie = filterCookieValue(auth.cookie || '', includeCookie);
  const out = {
    authorization: auth.authorization || '',
    deviceId: auth.deviceId || '',
    language: auth.language || 'zh_tw',
  };
  if (filteredCookie) out.cookie = filteredCookie;
  if (includeTokens) {
    if (auth.memberId) out.memberId = auth.memberId;
    if (auth.accessToken) out.accessToken = auth.accessToken;
    if (auth.poibankToken) out.poibankToken = auth.poibankToken;
    if (auth.webToken) out.webToken = auth.webToken;
  }
  return out;
}

function maskToken(value) {
  if (!value || typeof value !== 'string') return value;
  if (value.length <= 8) return '***';
  return `${value.slice(0, 4)}***${value.slice(-4)}`;
}

function redactExport(authJson) {
  const out = { ...authJson };
  if (out.authorization) out.authorization = `Bearer ${maskToken(out.authorization.replace(/^Bearer\s+/i, ''))}`;
  if (out.cookie) {
    out.cookie = String(out.cookie).replace(/(fld-[^=;\s]+)=([^;]+)/g, (_match, name, value) => `${name}=${maskToken(decodeURIComponent(value))}`);
  }
  for (const field of ['memberId', 'accessToken', 'poibankToken', 'webToken']) {
    if (out[field]) out[field] = maskToken(out[field]);
  }
  return out;
}

async function runExport(parsed) {
  const session = await ensureFunlidaySessionPage({ endpoint: parsed.endpoint });
  let auth;
  try {
    auth = await extractFunlidayAuth(session.page);
  } finally {
    await session.browser.close();
  }
  const exportShape = buildExportShape(auth, {
    includeCookie: parsed.includeCookie,
    includeTokens: parsed.includeTokens,
  });
  const outputPath = parsed.outputPath || path.resolve(DEFAULT_EXPORT_PATH);
  writeJson(outputPath, exportShape);
  try {
    fs.chmodSync(outputPath, 0o600);
  } catch {
    // chmod is best-effort; on Windows it may noop
  }
  if (parsed.print) {
    const printable = parsed.redact ? redactExport(exportShape) : exportShape;
    process.stdout.write(`${JSON.stringify(printable, null, 2)}\n`);
  }
  const fields = Object.keys(exportShape).join(', ');
  printCliSuccess(`OK [auth export]: wrote ${outputPath} (fields: ${fields})${parsed.includeTokens ? ' [tokens included]' : ''}`, { quiet: parsed.quiet });
  return { ok: true, outputPath, fields: Object.keys(exportShape) };
}

async function runCheck(parsed) {
  let auth = resolveAuthInput(parsed);
  let browser = null;
  if (!auth) {
    const session = await ensureFunlidaySessionPage({ endpoint: parsed.endpoint });
    browser = session.browser;
    auth = await extractFunlidayAuth(session.page);
  }
  try {
    const tripId = parsed.tripId || process.env.FUNLIDAY_TEST_TRIP_ID || '';
    if (tripId) {
      const body = { parseTripObjectId: tripId, deviceId: auth.deviceId };
      const response = await callFunlidayApi({ auth, apiName: 'getPoisOfTrip', body });
      const summary = {
        ok: true,
        endpoint: parsed.endpoint,
        memberId: auth.memberId || null,
        deviceId: auth.deviceId || null,
        language: auth.language,
        tripId,
        revision: response && response.results ? response.results.revision : null,
        poiCount: response && response.results && Array.isArray(response.results.pois) ? response.results.pois.length : null,
      };
      const outputPath = parsed.outputPath || resolveArtifactPath('active', 'auth_check_output.json');
      writeJson(outputPath, summary);
      printCliSuccess(`OK [auth check]: member=${summary.memberId || '-'} deviceId=${summary.deviceId ? 'present' : 'missing'} trip=${tripId} pois=${summary.poiCount} → ${outputPath}`, { quiet: parsed.quiet });
      return summary;
    }
    if (!auth.authorization || (!auth.cookie && !auth.webToken)) {
      throw new FunlidayCliError('AUTH_REQUIRED', 'Auth is missing required fields (authorization + cookie or webToken).');
    }
    const summary = {
      ok: true,
      endpoint: parsed.endpoint,
      memberId: auth.memberId || null,
      deviceId: auth.deviceId || null,
      language: auth.language,
      hasAuthorization: Boolean(auth.authorization),
      hasCookie: Boolean(auth.cookie),
      note: 'Structure is valid. Pass --trip-id <id> (or FUNLIDAY_TEST_TRIP_ID) to perform a live read-only call against Funliday.',
    };
    const outputPath = parsed.outputPath || resolveArtifactPath('active', 'auth_check_output.json');
    writeJson(outputPath, summary);
    printCliSuccess(`OK [auth check]: structure valid (member=${summary.memberId || '-'}, deviceId=${summary.deviceId ? 'present' : 'missing'}) → ${outputPath}`, { quiet: parsed.quiet });
    return summary;
  } finally {
    if (browser) await browser.close();
  }
}

async function runAuthCli(argv) {
  const parsed = parseAuthArgs(argv);
  if (parsed.subcommand === 'help') {
    printAuthUsage();
    return { ok: true, subcommand: 'help' };
  }
  if (parsed.subcommand === 'export') return runExport(parsed);
  if (parsed.subcommand === 'check') return runCheck(parsed);
  throw new Error(`Unsupported auth subcommand: ${parsed.subcommand}`);
}

module.exports = {
  parseAuthArgs,
  printAuthUsage,
  buildExportShape,
  filterCookieValue,
  redactExport,
  runAuthCli,
};
