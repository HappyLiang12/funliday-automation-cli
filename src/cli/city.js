const { searchCities } = require('../api/client');
const { FunlidayCliError } = require('../errors');
const { resolveArtifactPath, writeJson } = require('../io/paths');
const { parseCommonFlags, resolveAuthInput, printCliSuccess } = require('./shared');

function printCityUsage() {
  console.log(`Funliday City CLI

Usage:
  funliday-city search <keyword> [--output <file>] [--auth-file <file> | --env-auth] [--quiet]

Notes:
  Searches Funliday's city list (name, alias and local-language matches) and prints
  "<cityId> <name>[, <parent>][, <country>] (lat, lng)" per match — use the cityId
  with \`funliday-trip create --city-id <cityId>\`.

Flags:
  --quiet, -q   suppress stdout (city rows and the one-line success summary)
  --output <file>   override the artifact path (default: artifacts/active/funliday_city_search_output.json)

The search endpoint answers anonymously; --auth-file / --env-auth are accepted and
their session headers are forwarded when provided.`);
}

function parseCityArgs(argv) {
  const command = argv[0];
  if (!command || ['help', '--help', '-h'].includes(command)) return { command: 'help' };

  const { options: common, rest } = parseCommonFlags(argv.slice(1));
  return {
    command,
    keyword: rest.join(' ').trim(),
    endpoint: common.endpoint,
    outputPath: common.outputPath,
    authFile: common.authFile,
    useEnvAuth: common.useEnvAuth,
    quiet: common.quiet,
    debug: common.debug,
  };
}

function formatCityLine(city) {
  const location = city.location && Number.isFinite(city.location.lat) && Number.isFinite(city.location.lng)
    ? ` (lat ${city.location.lat}, lng ${city.location.lng})`
    : '';
  return `${city.cityId} ${city.displayName}${location}`;
}

async function runCityCli(argv) {
  const parsed = parseCityArgs(argv);
  if (parsed.command === 'help') {
    printCityUsage();
    return { ok: true, command: 'help' };
  }
  if (parsed.command !== 'search') {
    throw new FunlidayCliError('INVALID_COMMAND', `Unsupported command: ${parsed.command}. Try \`funliday-city search <keyword>\`.`);
  }
  if (!parsed.keyword) {
    throw new FunlidayCliError('INVALID_INPUT', 'search requires a keyword, e.g. `funliday-city search 沖繩`.');
  }

  const auth = resolveAuthInput(parsed);
  const result = await searchCities({ auth, keyword: parsed.keyword });
  const outputPath = parsed.outputPath || resolveArtifactPath('active', 'funliday_city_search_output.json');
  const payload = {
    ok: true,
    endpoint: parsed.endpoint,
    keyword: parsed.keyword,
    source: result.url,
    results: result.results,
  };
  writeJson(outputPath, payload);

  if (!parsed.quiet) {
    for (const city of result.results) process.stdout.write(`${formatCityLine(city)}\n`);
  }
  printCliSuccess(`OK: city "${parsed.keyword}" → ${result.results.length} results → ${outputPath}`, { quiet: parsed.quiet });
  return payload;
}

module.exports = {
  parseCityArgs,
  printCityUsage,
  formatCityLine,
  runCityCli,
};
