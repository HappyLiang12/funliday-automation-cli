const { callFunlidayApi } = require('../api/client');
const { ensureFunlidaySessionPage, extractFunlidayAuth } = require('../auth/browser-session');
const { resolveArtifactPath, writeJson } = require('../io/paths');
const { parseCommonFlags, resolveAuthInput, printCliSuccess } = require('./shared');

const TRIP_API_NAMES = new Set([
  'getPoisOfTrip',
  'deletePois',
  'addPoi',
  'updatePoiStartTime',
  'getTextNote',
  'postTextNote',
  'updatePoi',
]);

function printApiUsage() {
  console.log(`Usage: funliday-api <apiName> <bodyJson> [--output <file>] [--endpoint <url>] [--auth-file <file> | --env-auth] [--quiet]\n\nBody-shape notes:\n  Trip-targeting endpoints expect \`parseTripObjectId\`, NOT \`tripId\`.\n  This CLI auto-rewrites \`tripId\` -> \`parseTripObjectId\` for: ${[...TRIP_API_NAMES].join(', ')}.\n  See docs/public_api.md for the full per-endpoint body shape table.`);
}

function parseApiArgs(argv) {
  if (!argv[0] || ['help', '--help', '-h'].includes(argv[0])) return { help: true };
  const { options: common, rest } = parseCommonFlags(argv);
  return {
    help: false,
    endpoint: common.endpoint,
    outputPath: common.outputPath,
    authFile: common.authFile,
    useEnvAuth: common.useEnvAuth,
    quiet: common.quiet,
    debug: common.debug,
    apiName: rest[0] || 'getPoisOfTrip',
    bodyJson: rest[1] || '{}',
  };
}

function rewriteBodyForKnownApi(apiName, body) {
  if (!body || typeof body !== 'object') return { body, rewrites: [] };
  const rewrites = [];
  if (TRIP_API_NAMES.has(apiName) && body.parseTripObjectId === undefined && typeof body.tripId === 'string') {
    body.parseTripObjectId = body.tripId;
    delete body.tripId;
    rewrites.push('tripId -> parseTripObjectId');
  }
  return { body, rewrites };
}

async function runApiCli(argv) {
  const parsed = parseApiArgs(argv);
  if (parsed.help) {
    printApiUsage();
    return { ok: true, help: true };
  }

  let browser = null;
  try {
    let auth = resolveAuthInput(parsed);
    if (!auth) {
      const session = await ensureFunlidaySessionPage({ endpoint: parsed.endpoint });
      browser = session.browser;
      auth = await extractFunlidayAuth(session.page);
    }
    const body = JSON.parse(parsed.bodyJson);
    if (auth.deviceId && body.deviceId === undefined) {
      body.deviceId = auth.deviceId;
    }
    const { rewrites } = rewriteBodyForKnownApi(parsed.apiName, body);
    const response = await callFunlidayApi({ auth, apiName: parsed.apiName, body });
    const outputPath = parsed.outputPath || resolveArtifactPath('active', 'call_funliday_api_output.json');
    const payload = {
      endpoint: parsed.endpoint,
      apiName: parsed.apiName,
      requestBody: body,
      autoRewrites: rewrites,
      auth: {
        memberId: auth.memberId,
        deviceId: auth.deviceId,
        hasAccessToken: Boolean(auth.accessToken),
        hasWebToken: Boolean(auth.webToken),
      },
      response,
    };
    writeJson(outputPath, payload);
    const status = response && response.status ? response.status : 'ok';
    printCliSuccess(`OK: api ${parsed.apiName} (status=${status})${rewrites.length ? ` [auto: ${rewrites.join('; ')}]` : ''} → ${outputPath}`, { quiet: parsed.quiet });
    return payload;
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = {
  TRIP_API_NAMES,
  parseApiArgs,
  printApiUsage,
  rewriteBodyForKnownApi,
  runApiCli,
};
