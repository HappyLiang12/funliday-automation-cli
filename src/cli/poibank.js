const { searchPoibank } = require('../api/client');
const { ensureFunlidaySessionPage, extractFunlidayAuth } = require('../auth/browser-session');
const { resolveArtifactPath, writeJson } = require('../io/paths');
const { parseCommonFlags, resolveAuthInput, printCliSuccess } = require('./shared');

function printPoibankUsage() {
  console.log('Usage: funliday-poibank <keyword> [--output <file>] [--endpoint <url>] [--auth-file <file> | --env-auth] [--quiet]');
}

function parsePoibankArgs(argv) {
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
    keyword: rest[0] || 'demo keyword',
  };
}

async function runPoibankCli(argv) {
  const parsed = parsePoibankArgs(argv);
  if (parsed.help) {
    printPoibankUsage();
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
    const result = await searchPoibank({ auth, keyword: parsed.keyword });
    const outputPath = parsed.outputPath || resolveArtifactPath('active', 'search_poibank_output.json');
    const payload = {
      endpoint: parsed.endpoint,
      keyword: parsed.keyword,
      auth: {
        language: auth.language,
        hasPoibankToken: Boolean(auth.poibankToken),
      },
      ...result,
    };
    writeJson(outputPath, payload);
    const count = Array.isArray(result.results) ? result.results.length : 'unknown';
    printCliSuccess(`OK: poibank "${parsed.keyword}" → ${count} results → ${outputPath}`, { quiet: parsed.quiet });
    return payload;
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = {
  parsePoibankArgs,
  printPoibankUsage,
  runPoibankCli,
};
