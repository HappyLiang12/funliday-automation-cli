const fs = require('fs');
const path = require('path');
const { ensureFunlidaySessionPage, extractFunlidayAuth, DEFAULT_CDP_ENDPOINT } = require('../auth/browser-session');
const { createTrip, getTripContainer, updateTrip, formatTripDateForApi } = require('../api/client');
const { resolveArtifactPath, writeJson } = require('../io/paths');
const { createExecutionReview, summarizeExecutionReviews } = require('../observability/execution-review');
const { parseCommonFlags, resolveAuthInput } = require('./shared');

const TRIP_TYPE_ALIASES = {
  '1': '1', '2': '2', '3': '3', '4': '4',
  solo: '1', single: '1', '獨旅': '1',
  couple: '2', couples: '2', '情侶': '2',
  friend: '3', friends: '3', group: '3', '朋友': '3',
  family: '4', '家族': '4',
};

function printTripUsage() {
  console.log(`Funliday Trip CLI\n\nUsage:\n  funliday-trip get --trip-id <tripId> [--output <file>] [--endpoint <url>] [--auth-file <file> | --env-auth]\n  funliday-trip create --name <name> --city-id <cityId> --start-date <YYYY-MM-DD> --end-date <YYYY-MM-DD> --trip-type <1/2/3/4/friends> [--output <file>]\n  funliday-trip update --trip-id <tripId> [--name <name>] [--start-date <YYYY-MM-DD>] [--end-date <YYYY-MM-DD>] [--trip-type <1/2/3/4/friends>] [--city-id <cityId>] [--output <file>]\n\nPayload shortcuts:\n  --json '{"tripId":"...","name":"..."}'\n  --file path\\to\\payload.json`);
}

function normalizeTripType(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return '';
  const normalized = TRIP_TYPE_ALIASES[text];
  if (!normalized) throw new Error(`Unsupported trip type: ${value}`);
  return normalized;
}

function normalizeCityIds(payload, cliCityIds) {
  const raw = [
    ...(Array.isArray(payload.userCities) ? payload.userCities : []),
    ...(Array.isArray(payload.cityIds) ? payload.cityIds : []),
    ...(payload.cityId ? [payload.cityId] : []),
    ...(Array.isArray(cliCityIds) ? cliCityIds : []),
  ];
  return [...new Set(raw.map((item) => String(item).trim()).filter(Boolean))];
}

function mergeCreatePayload(parsed, payload) {
  return {
    name: parsed.name || payload.name || '',
    userCities: normalizeCityIds(payload, parsed.cityIds),
    dateStart: formatTripDateForApi(parsed.startDate || payload.dateStart || payload.start_date || ''),
    dateEnd: formatTripDateForApi(parsed.endDate || payload.dateEnd || payload.date_end || ''),
    tripType: normalizeTripType(parsed.tripType || payload.tripType || payload.type || ''),
  };
}

function normalizeContainerDates(summary) {
  return {
    dateStart: formatTripDateForApi(summary.dateStart || ''),
    dateEnd: formatTripDateForApi(summary.dateEnd || ''),
  };
}

function mergeUpdatePayload(parsed, payload, currentSummary) {
  const currentDates = normalizeContainerDates(currentSummary);
  const requestedCityIds = normalizeCityIds(payload, parsed.cityIds);
  return {
    tripId: parsed.tripId || payload.tripId || payload.id || '',
    name: parsed.name || payload.name || currentSummary.name,
    dateStart: formatTripDateForApi(parsed.startDate || payload.dateStart || payload.start_date || currentDates.dateStart),
    dateEnd: formatTripDateForApi(parsed.endDate || payload.dateEnd || payload.date_end || currentDates.dateEnd),
    tripType: normalizeTripType(parsed.tripType || payload.tripType || payload.type || currentSummary.tripType),
    userCities: requestedCityIds,
  };
}

function ensureCreatePayload(payload) {
  if (!payload.name) throw new Error('create requires `name`.');
  if (!Array.isArray(payload.userCities) || payload.userCities.length === 0) throw new Error('create requires at least one `cityId` / `userCities` value.');
  if (!payload.dateStart) throw new Error('create requires `dateStart`.');
  if (!payload.dateEnd) throw new Error('create requires `dateEnd`.');
  if (!payload.tripType) throw new Error('create requires `tripType`.');
}

function defaultOutputPath(command) {
  return resolveArtifactPath('active', `funliday_trip_cli_${command}_output.json`);
}

function parseTripArgs(argv) {
  const command = argv[0];
  if (!command || ['help', '--help', '-h'].includes(command)) return { command: 'help' };

  const { options: common, rest } = parseCommonFlags(argv.slice(1));
  const options = {
    endpoint: common.endpoint || DEFAULT_CDP_ENDPOINT,
    outputPath: common.outputPath,
    authFile: common.authFile,
    useEnvAuth: common.useEnvAuth,
    jsonText: '',
    filePath: '',
    name: '',
    tripId: '',
    startDate: '',
    endDate: '',
    tripType: '',
    cityIds: [],
  };

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--json') { options.jsonText = rest[index + 1] || options.jsonText; index += 1; continue; }
    if (arg === '--file') { options.filePath = rest[index + 1] || options.filePath; index += 1; continue; }
    if (arg === '--name') { options.name = rest[index + 1] || options.name; index += 1; continue; }
    if (arg === '--trip-id') { options.tripId = rest[index + 1] || options.tripId; index += 1; continue; }
    if (arg === '--start-date') { options.startDate = rest[index + 1] || options.startDate; index += 1; continue; }
    if (arg === '--end-date') { options.endDate = rest[index + 1] || options.endDate; index += 1; continue; }
    if (arg === '--trip-type') { options.tripType = rest[index + 1] || options.tripType; index += 1; continue; }
    if (arg === '--city-id') { const raw = rest[index + 1] || ''; options.cityIds.push(...raw.split(',').map((item) => item.trim()).filter(Boolean)); index += 1; continue; }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { command, ...options };
}

function readPayloadFromInput({ jsonText, filePath }) {
  let payload = {};
  if (filePath) payload = JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
  if (jsonText) payload = { ...payload, ...JSON.parse(jsonText) };
  return payload;
}

async function resolveAuth(parsed) {
  const explicitAuth = resolveAuthInput(parsed);
  if (explicitAuth) return { auth: explicitAuth, browser: null };
  const session = await ensureFunlidaySessionPage({ endpoint: parsed.endpoint });
  return { auth: await extractFunlidayAuth(session.page), browser: session.browser };
}

async function runTripCli(argv) {
  const parsed = parseTripArgs(argv);
  if (parsed.command === 'help') {
    printTripUsage();
    return { ok: true, command: 'help' };
  }
  if (!['get', 'create', 'update'].includes(parsed.command)) throw new Error(`Unsupported command: ${parsed.command}`);

  const outputPath = parsed.outputPath || defaultOutputPath(parsed.command);
  const payload = readPayloadFromInput(parsed);
  const reviews = [];
  const addReview = (input) => { const review = createExecutionReview(input); reviews.push(review); return review; };

  let browser = null;
  try {
    const resolved = await resolveAuth(parsed);
    browser = resolved.browser;
    const auth = resolved.auth;
    addReview({ domain: 'funliday-trip-cli', operation: 'resolveAuth', ok: true, context: { endpoint: parsed.endpoint }, signals: { sharedHelperUsed: true } });

    let result = null;
    let resolvedPayload = null;

    if (parsed.command === 'get') {
      const tripId = parsed.tripId || payload.tripId || payload.id || '';
      if (!tripId) throw new Error('get requires `--trip-id` or payload.tripId.');
      result = await getTripContainer({ auth, tripId });
      resolvedPayload = { tripId };
      addReview({ domain: 'funliday-trip-cli', operation: 'getTripContainer', ok: true, context: { tripId, summary: result.summary }, signals: { sharedHelperUsed: true } });
    }

    if (parsed.command === 'create') {
      resolvedPayload = mergeCreatePayload(parsed, payload);
      ensureCreatePayload(resolvedPayload);
      const created = await createTrip({ auth, ...resolvedPayload });
      const createdMeta = await getTripContainer({ auth, tripId: created.tripId });
      result = { ...created, container: createdMeta.container, summary: createdMeta.summary };
      addReview({ domain: 'funliday-trip-cli', operation: 'createTrip', ok: true, context: { tripId: created.tripId, payload: resolvedPayload }, signals: { sharedHelperUsed: true } });
    }

    if (parsed.command === 'update') {
      const tripId = parsed.tripId || payload.tripId || payload.id || '';
      if (!tripId) throw new Error('update requires `--trip-id` or payload.tripId.');
      const current = await getTripContainer({ auth, tripId });
      addReview({ domain: 'funliday-trip-cli', operation: 'getTripContainer', ok: true, context: { tripId, summary: current.summary }, signals: { sharedHelperUsed: true } });
      resolvedPayload = mergeUpdatePayload(parsed, payload, current.summary);
      result = await updateTrip({ auth, ...resolvedPayload });
      addReview({ domain: 'funliday-trip-cli', operation: 'updateTrip', ok: true, context: { tripId, payload: resolvedPayload, summary: result.summary }, signals: { sharedHelperUsed: true } });
    }

    const finalOutput = {
      ok: true,
      command: parsed.command,
      endpoint: parsed.endpoint,
      resolvedPayload,
      result,
      operationReviews: reviews,
      executionReviewSummary: summarizeExecutionReviews(reviews),
    };
    writeJson(outputPath, finalOutput);
    return finalOutput;
  } catch (error) {
    addReview({ domain: 'funliday-trip-cli', operation: parsed.command, ok: false, error, context: { endpoint: parsed.endpoint }, signals: { sharedHelperUsed: true, manualFollowUp: true } });
    const failure = { ok: false, command: parsed.command, endpoint: parsed.endpoint, error: String(error && error.stack ? error.stack : error), operationReviews: reviews, executionReviewSummary: summarizeExecutionReviews(reviews) };
    writeJson(outputPath, failure);
    throw error;
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = {
  TRIP_TYPE_ALIASES,
  parseTripArgs,
  printTripUsage,
  normalizeTripType,
  normalizeCityIds,
  mergeCreatePayload,
  mergeUpdatePayload,
  ensureCreatePayload,
  readPayloadFromInput,
  runTripCli,
};


