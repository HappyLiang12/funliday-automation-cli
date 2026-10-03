const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { searchCities } = require('../src/api/client');
const { parseCityArgs, formatCityLine, runCityCli } = require('../src/cli/city');

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

// Real v2/autocomplete response skeleton (two cities + one place to be filtered out).
const CITY_AUTOCOMPLETE_BODY = [
  {
    type: 2,
    action: { api: { method: 'get', endpoint: '/v2/search', host: 'p' } },
    extras: {
      city: {
        location: { lng: 127.6922209, lat: 26.213854 },
        bbox_type: 2,
        tags: { is_hot: true },
        has_overview: true,
        country: { id: '12075006', name: '日本' },
        city: { id: '23120225', name: '沖繩縣', name_alias: '' },
        name: '<FUNLIDAY_SEARCH>沖繩</FUNLIDAY_SEARCH>縣, 日本',
      },
    },
    prefer_id: 'ci-23120225',
    name: '<FUNLIDAY_SEARCH>沖繩</FUNLIDAY_SEARCH>縣, 日本',
  },
  {
    type: 2,
    action: { api: { method: 'get', endpoint: '/v2/search', host: 'p' } },
    extras: {
      city: {
        location: { lng: 127.806341, lat: 26.3383929 },
        bbox_type: 2,
        country: { id: '12075006', name: '日本' },
        city: { id: '12606436', name: '沖繩市', name_alias: '沖繩' },
        parent: { id: '23120225', name: '沖繩縣' },
        name: '<FUNLIDAY_SEARCH>沖繩</FUNLIDAY_SEARCH>市, 沖繩縣, 日本',
      },
    },
    prefer_id: 'ci-12606436',
    name_alias: '沖繩',
    name: '<FUNLIDAY_SEARCH>沖繩</FUNLIDAY_SEARCH>市, 沖繩縣, 日本',
  },
  {
    type: 3,
    action: { social: { type: 11, id: '16608894' } },
    extras: {
      poi: {
        id: '16608894',
        name: '沖繩美麗海水族館',
        location: { lng: 127.8779542, lat: 26.6942731 },
        city: { id: 23120225, name: '沖繩縣' },
      },
    },
    prefer_id: 'p-16608894-wudzvgtc',
    name: '<FUNLIDAY_SEARCH>沖繩</FUNLIDAY_SEARCH>美麗海水族館, <FUNLIDAY_SEARCH>沖繩</FUNLIDAY_SEARCH>縣',
  },
];

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

test('searchCities hits the autocomplete proxy with type=city and maps only city rows', async (t) => {
  let captured = null;
  stubFetch(t, async (url, options) => {
    captured = { url: String(url), options };
    return jsonResponse(CITY_AUTOCOMPLETE_BODY);
  });

  const result = await searchCities({ keyword: '沖繩' });
  assert.equal(captured.url, `https://www.funliday.com/proxy/v2/autocomplete?q=${encodeURIComponent('沖繩')}&type=city`);

  assert.equal(result.results.length, 2);
  assert.deepEqual(result.results[0], {
    cityId: '23120225',
    name: '沖繩縣',
    nameAlias: '',
    displayName: '沖繩縣, 日本',
    location: { lat: 26.213854, lng: 127.6922209 },
    countryId: '12075006',
    countryName: '日本',
    parentId: '',
    parentName: '',
  });
  assert.equal(result.results[1].cityId, '12606436');
  assert.equal(result.results[1].nameAlias, '沖繩');
  assert.equal(result.results[1].displayName, '沖繩市, 沖繩縣, 日本');
  assert.equal(result.results[1].parentId, '23120225');
});

test('searchCities forwards session headers only when auth is provided', async (t) => {
  const seen = [];
  stubFetch(t, async (url, options) => {
    seen.push(options.headers);
    return jsonResponse(CITY_AUTOCOMPLETE_BODY);
  });

  await searchCities({ keyword: '沖繩' });
  assert.equal(seen[0].cookie, undefined);
  assert.equal(seen[0].authorization, undefined);
  assert.equal(seen[0]['accept-language'], 'zh-TW');

  await searchCities({ auth: { cookie: 'fld-clientId=dev', authorization: 'Bearer x', language: 'en_us' }, keyword: '沖繩' });
  assert.equal(seen[1].cookie, 'fld-clientId=dev');
  assert.equal(seen[1].authorization, 'Bearer x');
  assert.equal(seen[1]['accept-language'], 'en-US');
});

test('searchCities rejects empty keywords', async (t) => {
  stubFetch(t, async () => jsonResponse(CITY_AUTOCOMPLETE_BODY));
  await assert.rejects(
    () => searchCities({ keyword: '   ' }),
    (error) => error.code === 'INVALID_INPUT',
  );
});

test('searchCities maps 401 to AUTH_EXPIRED and other errors to FUNLIDAY_PROXY_API_ERROR', async (t) => {
  stubFetch(t, async () => jsonResponse('unauthorized', 401));
  await assert.rejects(
    () => searchCities({ keyword: 'x' }),
    (error) => error.code === 'AUTH_EXPIRED',
  );

  stubFetch(t, async () => jsonResponse('boom', 500));
  await assert.rejects(
    () => searchCities({ keyword: 'x' }),
    (error) => error.code === 'FUNLIDAY_PROXY_API_ERROR',
  );
});

test('searchCities rejects non-array payloads', async (t) => {
  stubFetch(t, async () => jsonResponse({ error: 'nope' }));
  await assert.rejects(
    () => searchCities({ keyword: 'x' }),
    (error) => error.code === 'FUNLIDAY_PROXY_API_ERROR',
  );
});

test('parseCityArgs handles help, search keyword joining and common flags', () => {
  assert.equal(parseCityArgs([]).command, 'help');
  assert.equal(parseCityArgs(['--help']).command, 'help');

  const parsed = parseCityArgs(['search', 'New', 'York', '--quiet', '--output', 'out.json', '--auth-file', 'auth.json']);
  assert.equal(parsed.command, 'search');
  assert.equal(parsed.keyword, 'New York');
  assert.equal(parsed.quiet, true);
  assert.equal(parsed.outputPath, 'out.json');
  assert.equal(parsed.authFile, 'auth.json');
});

test('formatCityLine prints id, display name and location', () => {
  assert.equal(
    formatCityLine({ cityId: '23120225', displayName: '沖繩縣, 日本', location: { lat: 26.213854, lng: 127.6922209 } }),
    '23120225 沖繩縣, 日本 (lat 26.213854, lng 127.6922209)',
  );
  assert.equal(
    formatCityLine({ cityId: '1', displayName: 'Nowhere', location: null }),
    '1 Nowhere',
  );
});

test('runCityCli search prints rows + summary and writes the { keyword, results } artifact', async (t) => {
  stubFetch(t, async () => jsonResponse(CITY_AUTOCOMPLETE_BODY));
  const chunks = captureStdout(t);
  const outputPath = path.join(os.tmpdir(), `funliday-test-city-${process.pid}-${Date.now()}.json`);
  t.after(() => fs.rmSync(outputPath, { force: true }));

  const payload = await runCityCli(['search', '沖繩', '--output', outputPath]);

  const stdout = chunks.join('');
  assert.match(stdout, /23120225 沖繩縣, 日本 \(lat 26\.213854, lng 127\.6922209\)/);
  assert.match(stdout, /12606436 沖繩市, 沖繩縣, 日本/);
  assert.match(stdout, /OK: city "沖繩" → 2 results → /);
  assert.equal(stdout.includes('16608894'), false);

  assert.equal(payload.keyword, '沖繩');
  assert.equal(payload.results.length, 2);
  const artifact = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  assert.equal(artifact.keyword, '沖繩');
  assert.equal(artifact.results[0].cityId, '23120225');
  assert.match(artifact.source, /proxy\/v2\/autocomplete\?q=/);
});

test('runCityCli search --quiet prints nothing', async (t) => {
  stubFetch(t, async () => jsonResponse(CITY_AUTOCOMPLETE_BODY));
  const chunks = captureStdout(t);
  const outputPath = path.join(os.tmpdir(), `funliday-test-city-q-${process.pid}-${Date.now()}.json`);
  t.after(() => fs.rmSync(outputPath, { force: true }));

  await runCityCli(['search', '沖繩', '--output', outputPath, '--quiet']);
  assert.equal(chunks.join(''), '');
});

test('runCityCli rejects unknown subcommands and missing keywords', async (t) => {
  stubFetch(t, async () => jsonResponse(CITY_AUTOCOMPLETE_BODY));
  await assert.rejects(
    () => runCityCli(['list']),
    (error) => error.code === 'INVALID_COMMAND',
  );
  await assert.rejects(
    () => runCityCli(['search']),
    (error) => error.code === 'INVALID_INPUT',
  );
});
