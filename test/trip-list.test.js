const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { getTripList, getSharedTripList } = require('../src/api/client');
const { formatListedTrip, sortTripsNewestFirst, runTripCli } = require('../src/cli/trip');

function stubFetch(t, respond) {
  const originalFetch = global.fetch;
  global.fetch = respond;
  t.after(() => {
    global.fetch = originalFetch;
  });
}

function jsonResponse(body, status = 200) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    status,
    text: async () => text,
    arrayBuffer: async () => Buffer.from(text, 'utf8'),
  };
}

// Real getTripList response skeleton with fake (redacted) ids.
const TRIP_LIST_BODY = {
  status: '200',
  results: {
    totalCount: '2',
    skip: '0',
    trips: [
      {
        _id: 'aaaaaaaaaaaaaaaaaaaaaaa1',
        containerId: 'aaaaaaaaaaaaaaaaaaaaaaa1',
        tripName: '沖繩 北中部自駕',
        startDate: '1793318400',
        dayCount: '3',
      },
      {
        _id: 'bbbbbbbbbbbbbbbbbbbbbbb2',
        containerId: 'bbbbbbbbbbbbbbbbbbbbbbb2',
        tripName: '上海 2天1夜',
        startDate: '1786752000',
        endDate: '1786838400',
        dayCount: '2',
      },
    ],
  },
};

const SHARED_LIST_BODY = {
  status: '200',
  results: {
    totalCount: '1',
    skip: '0',
    trips: [
      {
        _id: 'ccccccccccccccccccccccc3',
        containerId: 'ccccccccccccccccccccccc3',
        tripName: '四國 9日遊',
        startDate: '1778112000',
        dayCount: '9',
      },
    ],
  },
};

function writeTempAuthFile(t) {
  const filePath = path.join(os.tmpdir(), `funliday-test-auth-${process.pid}-${Date.now()}.json`);
  fs.writeFileSync(filePath, JSON.stringify({
    authorization: 'Bearer test-memberid_testtoken',
    deviceId: 'test-device-id',
    language: 'zh_tw',
    cookie: 'fld-clientId=test-device-id',
  }), 'utf8');
  t.after(() => fs.rmSync(filePath, { force: true }));
  return filePath;
}

function captureStdout(t) {
  const original = process.stdout.write;
  const chunks = [];
  process.stdout.write = (chunk) => {
    chunks.push(String(chunk));
    return true;
  };
  t.after(() => {
    process.stdout.write = original;
  });
  return chunks;
}

test('getTripList posts deviceId to the getTripList endpoint and parses results', async (t) => {
  let captured = null;
  stubFetch(t, async (url, options) => {
    captured = { url: String(url), options };
    return jsonResponse(TRIP_LIST_BODY);
  });

  const result = await getTripList({ auth: { authorization: 'Bearer x', cookie: 'c', deviceId: 'dev-1' } });
  assert.equal(captured.url, 'https://www.funlidays.com/api/getTripList');
  assert.equal(captured.options.method, 'POST');
  assert.equal(captured.options.headers.authorization, 'Bearer x');
  assert.deepEqual(JSON.parse(captured.options.body), { deviceId: 'dev-1', skip: '0', limit: '100' });
  assert.equal(result.totalCount, 2);
  assert.equal(result.trips.length, 2);
  assert.equal(result.trips[0].tripName, '沖繩 北中部自駕');
});

test('getSharedTripList posts to the getSharedTripList endpoint', async (t) => {
  let capturedUrl = '';
  stubFetch(t, async (url) => {
    capturedUrl = String(url);
    return jsonResponse(SHARED_LIST_BODY);
  });

  const result = await getSharedTripList({ auth: { authorization: 'Bearer x', cookie: 'c', deviceId: 'dev-1' } });
  assert.equal(capturedUrl, 'https://www.funlidays.com/api/getSharedTripList');
  assert.equal(result.trips[0].tripName, '四國 9日遊');
});

test('getTripList maps a 401 body to AUTH_EXPIRED', async (t) => {
  stubFetch(t, async () => jsonResponse({ status: '401', message: 'invalid access token' }));
  await assert.rejects(
    () => getTripList({ auth: { authorization: 'Bearer x', cookie: 'c', deviceId: 'dev-1' } }),
    (error) => error.code === 'AUTH_EXPIRED',
  );
});

test('getTripList rejects an unexpected payload shape', async (t) => {
  stubFetch(t, async () => jsonResponse({ status: '200', results: { totalCount: '0' } }));
  await assert.rejects(
    () => getTripList({ auth: { authorization: 'Bearer x', cookie: 'c', deviceId: 'dev-1' } }),
    (error) => error.code === 'FUNLIDAY_API_ERROR' && /results\.trips/.test(error.message),
  );
});

test('formatListedTrip derives dateEnd from dayCount and formats unix dates as YYYY/MM/DD', () => {
  const derived = formatListedTrip({ containerId: 'id-1', tripName: 'T', startDate: '1793318400', dayCount: '3' });
  assert.deepEqual(derived, {
    tripId: 'id-1',
    name: 'T',
    dateStart: '2026/10/30',
    dateEnd: '2026/11/01',
    dayCount: 3,
    shared: false,
  });

  const explicit = formatListedTrip({ _id: 'fallback-id', tripName: 'S', startDate: '1786752000', endDate: '1786838400', dayCount: '2' }, { shared: true });
  assert.equal(explicit.tripId, 'fallback-id');
  assert.equal(explicit.dateStart, '2026/08/15');
  assert.equal(explicit.dateEnd, '2026/08/16');
  assert.equal(explicit.shared, true);
});

test('formatListedTrip tolerates missing dates', () => {
  const blank = formatListedTrip({ tripName: 'No dates' });
  assert.equal(blank.dateStart, null);
  assert.equal(blank.dateEnd, null);
  assert.equal(blank.dayCount, null);
});

test('sortTripsNewestFirst orders by dateStart descending, undated last', () => {
  const sorted = sortTripsNewestFirst([
    { name: 'old', dateStart: '2025/03/21' },
    { name: 'undated', dateStart: null },
    { name: 'new', dateStart: '2026/10/30' },
  ]);
  assert.deepEqual(sorted.map((trip) => trip.name), ['new', 'old', 'undated']);
});

test('runTripCli list merges owned + shared trips, prints the summary and writes the artifact', async (t) => {
  stubFetch(t, async (url) => {
    if (String(url).includes('getSharedTripList')) return jsonResponse(SHARED_LIST_BODY);
    if (String(url).includes('getTripList')) return jsonResponse(TRIP_LIST_BODY);
    throw new Error(`unexpected fetch: ${url}`);
  });
  const chunks = captureStdout(t);
  const authFile = writeTempAuthFile(t);
  const outputPath = path.join(os.tmpdir(), `funliday-test-list-${process.pid}-${Date.now()}.json`);
  t.after(() => fs.rmSync(outputPath, { force: true }));

  const finalOutput = await runTripCli(['list', '--auth-file', authFile, '--output', outputPath]);

  const stdout = chunks.join('');
  assert.match(stdout, /^OK: 3 trips → /);
  assert.match(stdout, new RegExp(outputPath.replace(/\\/g, '\\\\')));

  assert.equal(finalOutput.command, 'list');
  assert.equal(finalOutput.result.totalCount, 3);
  assert.equal(finalOutput.result.ownedCount, 2);
  assert.equal(finalOutput.result.sharedCount, 1);
  // Newest first: 沖繩 (1793318400) > 上海 (1786752000) > 四國 (1778112000).
  assert.deepEqual(finalOutput.result.trips.map((trip) => trip.name), ['沖繩 北中部自駕', '上海 2天1夜', '四國 9日遊']);
  assert.equal(finalOutput.result.trips[0].shared, false);
  assert.equal(finalOutput.result.trips[2].shared, true);

  const artifact = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  assert.deepEqual(artifact.result.trips, finalOutput.result.trips);
});

test('runTripCli list --quiet suppresses stdout', async (t) => {
  stubFetch(t, async (url) => {
    if (String(url).includes('getSharedTripList')) return jsonResponse(SHARED_LIST_BODY);
    return jsonResponse(TRIP_LIST_BODY);
  });
  const chunks = captureStdout(t);
  const authFile = writeTempAuthFile(t);
  const outputPath = path.join(os.tmpdir(), `funliday-test-list-q-${process.pid}-${Date.now()}.json`);
  t.after(() => fs.rmSync(outputPath, { force: true }));

  await runTripCli(['list', '--auth-file', authFile, '--output', outputPath, '--quiet']);
  assert.equal(chunks.join(''), '');
});
