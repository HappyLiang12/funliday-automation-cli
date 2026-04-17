const { callFunlidayApi } = require('../api/client');
const { ensureFunlidaySessionPage, extractFunlidayAuth } = require('../auth/browser-session');
const { resolveArtifactPath, writeJson } = require('../io/paths');
const { parseCommonFlags, resolveAuthInput } = require('./shared');

function printApiUsage() {
  console.log('Usage: funliday-api <apiName> <bodyJson> [--output <file>] [--endpoint <url>] [--auth-file <file> | --env-auth]');
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
    apiName: rest[0] || 'getPoisOfTrip',
    bodyJson: rest[1] || '{}',
  };
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
    const response = await callFunlidayApi({ auth, apiName: parsed.apiName, body });
    const outputPath = parsed.outputPath || resolveArtifactPath('active', 'call_funliday_api_output.json');
    const payload = {
      endpoint: parsed.endpoint,
      apiName: parsed.apiName,
      requestBody: body,
      auth: {
        memberId: auth.memberId,
        deviceId: auth.deviceId,
        hasAccessToken: Boolean(auth.accessToken),
        hasWebToken: Boolean(auth.webToken),
      },
      response,
    };
    writeJson(outputPath, payload);
    return payload;
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = {
  parseApiArgs,
  printApiUsage,
  runApiCli,
};

