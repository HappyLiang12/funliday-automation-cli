const test = require('node:test');
const assert = require('node:assert/strict');
const { searchPoibank } = require('../src/api/client');

function stubFetch(t, respond) {
  const originalFetch = global.fetch;
  global.fetch = respond;
  t.after(() => {
    global.fetch = originalFetch;
  });
}

function jsonResponse(body, status = 200) {
  return {
    status,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

test('searchPoibank parses the JSON body and exposes results', async (t) => {
  stubFetch(t, async () => jsonResponse({
    code: 1,
    code_message: 'success',
    data: [
      { id: 101, name: '那覇空港', address: 'Naha', location: { lat: 26.2, lng: 127.6 } },
      { id: 102, name: '首里城', address: 'Shuri', location: { lat: 26.21, lng: 127.72 } },
    ],
  }));

  const result = await searchPoibank({ auth: { poibankToken: 'token' }, keyword: '沖繩' });
  assert.equal(result.status, 200);
  assert.equal(result.results.length, 2);
  assert.equal(result.results[0].name, '那覇空港');
  assert.match(result.url, /poi\/search\?q=/);
});

test('searchPoibank returns an empty results array for non-JSON bodies', async (t) => {
  stubFetch(t, async () => jsonResponse('service unavailable', 200));
  const result = await searchPoibank({ auth: { poibankToken: 'token' }, keyword: 'x' });
  assert.deepEqual(result.results, []);
});

test('searchPoibank rejects placeholder rows with POIBANK_ACCESS_UPGRADE_REQUIRED', async (t) => {
  const placeholder = { id: 99999999, address: 'Please upgrade App', name: 'Please upgrade App', location: { lat: 0, lng: 0 } };
  stubFetch(t, async () => jsonResponse({ code: 1, code_message: 'success', data: [placeholder, placeholder] }));

  await assert.rejects(
    () => searchPoibank({ auth: { poibankToken: 'token' }, keyword: '美ら海水族館' }),
    (error) => {
      assert.equal(error.code, 'POIBANK_ACCESS_UPGRADE_REQUIRED');
      assert.equal(error.details.placeholderCount, 2);
      assert.match(error.message, /Please upgrade App/);
      assert.ok(error.details.hint);
      return true;
    },
  );
});

test('searchPoibank keeps real rows that merely contain a placeholder name', async (t) => {
  stubFetch(t, async () => jsonResponse({
    code: 1,
    code_message: 'success',
    data: [
      { id: 99999999, name: 'Please upgrade App' },
      { id: 202, name: 'Real POI' },
    ],
  }));

  const result = await searchPoibank({ auth: { poibankToken: 'token' }, keyword: 'x' });
  assert.equal(result.results.length, 2);
});

test('searchPoibank still errors on non-200 responses', async (t) => {
  stubFetch(t, async () => jsonResponse('nope', 500));
  await assert.rejects(
    () => searchPoibank({ auth: { poibankToken: 'token' }, keyword: 'x' }),
    (error) => error.code === 'POIBANK_API_ERROR',
  );
});
