const { DEFAULT_CDP_ENDPOINT, FUNLIDAY_URL } = require('../auth/browser-session');
const { FunlidayCliError } = require('../errors');

const FUNLIDAY_API_BASE = 'https://www.funlidays.com/api';
const FUNLIDAY_NEXT_API_BASE = `${FUNLIDAY_URL}/api/next`;
const FUNLIDAY_PROXY_API_BASE = `${FUNLIDAY_URL}/proxy`;
const POIBANK_API_BASE = 'https://api.poibank.com';

function createLogger() {
  const logs = [];
  const log = (step, details = {}) => logs.push({ at: new Date().toISOString(), step, ...details });
  return { logs, log };
}

function formatTripDateForApi(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(text)) return text;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text.replace(/-/g, '/');
  if (/^\d{8}$/.test(text)) return `${text.slice(0, 4)}/${text.slice(4, 6)}/${text.slice(6, 8)}`;
  return text;
}

function summarizeTripContainer(container) {
  return {
    tripId: container.id,
    name: container.name,
    tripType: Number(container.type),
    dateStart: formatTripDateForApi(container.dateStart),
    dateEnd: formatTripDateForApi(container.dateEnd),
    userCities: Array.isArray(container.userCities) ? container.userCities : [],
    updatedAt: container.updated_at || null,
    permission: container.permission || null,
  };
}

function ensureAuth(auth) {
  if (!auth || !auth.authorization || !auth.cookie) {
    throw new FunlidayCliError('AUTH_REQUIRED', 'A valid Funliday auth object with `authorization` and `cookie` is required.');
  }
}

const AUTH_EXPIRED_PATTERN = /invalid access token|access token expired|token expired|unauthori[sz]ed|please log ?in|請重新登入|登入逾時|未登入/i;

function looksLikeAuthExpired({ httpStatus, status, message, text }) {
  if (httpStatus === 401 || httpStatus === 403) return true;
  if (status === '401' || status === '403') return true;
  const blob = `${message || ''} ${text || ''}`;
  return AUTH_EXPIRED_PATTERN.test(blob);
}

function throwApiError({ apiName, route, httpStatus, status, message, text, code = 'FUNLIDAY_API_ERROR', label = apiName || route }) {
  const expired = looksLikeAuthExpired({ httpStatus, status, message, text });
  const errorCode = expired ? 'AUTH_EXPIRED' : code;
  const detailMessage = expired
    ? `${label} failed: auth appears expired (HTTP ${httpStatus} / ${status || 'NO_STATUS'} / ${(message || (text || '').slice(0, 200))}). Re-export auth.json from a logged-in browser.`
    : `${label} failed: HTTP ${httpStatus} / ${status || 'NO_STATUS'} / ${message || (text || '').slice(0, 500)}`;
  throw new FunlidayCliError(errorCode, detailMessage, { apiName: apiName || undefined, route: route || undefined, httpStatus, responseText: (text || '').slice(0, 500) });
}

async function callFunlidayApi({ auth, apiName, body, log }) {
  ensureAuth(auth);

  const res = await fetch(`${FUNLIDAY_API_BASE}/${apiName}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json;charset=UTF-8',
      accept: 'application/json, text/plain, */*',
      origin: FUNLIDAY_URL,
      referer: `${FUNLIDAY_URL}/`,
      authorization: auth.authorization,
      cookie: auth.cookie,
    },
    body: JSON.stringify(body),
  });

  const text = Buffer.from(await res.arrayBuffer()).toString('utf8');
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    // keep text fallback below
  }

  if (log) {
    log('api', {
      apiName,
      request: body,
      httpStatus: res.status,
      status: data && data.status,
      message: data && data.message,
    });
  }

  if (res.status !== 200 || !data || data.status !== '200') {
    throwApiError({
      apiName,
      httpStatus: res.status,
      status: data && data.status,
      message: data && data.message,
      text,
    });
  }

  return data;
}

async function callFunlidayNextFormApi({ auth, route, form, refererPath = '/me/trips', log }) {
  ensureAuth(auth);

  const url = `${FUNLIDAY_NEXT_API_BASE}/${route}`;
  const formBody = new URLSearchParams();
  for (const [key, value] of Object.entries(form || {})) {
    formBody.set(key, value === undefined || value === null ? '' : String(value));
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
      accept: 'application/json, text/plain, */*',
      origin: FUNLIDAY_URL,
      referer: `${FUNLIDAY_URL}${refererPath}`,
      authorization: auth.authorization,
      cookie: auth.cookie,
    },
    body: formBody.toString(),
  });

  const text = Buffer.from(await res.arrayBuffer()).toString('utf8');
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    // keep raw text
  }

  if (log) {
    log('nextApi', {
      route,
      request: form,
      httpStatus: res.status,
      success: data && data.success,
    });
  }

  if (res.status !== 200 || !data || data.success !== true) {
    throwApiError({
      route,
      httpStatus: res.status,
      status: data && data.success === true ? '200' : (data && data.success === false ? 'success=false' : 'NO_SUCCESS'),
      message: data && data.message,
      text,
      code: 'FUNLIDAY_NEXT_API_ERROR',
    });
  }

  return {
    url,
    requestForm: { ...form },
    response: data,
  };
}

async function callFunlidayNextApi({ auth, route, method = 'GET', refererPath = '/me/trips', headers = {}, body, log }) {
  ensureAuth(auth);

  const url = `${FUNLIDAY_NEXT_API_BASE}/${route}`;
  const res = await fetch(url, {
    method,
    headers: {
      accept: 'application/json, text/plain, */*',
      origin: FUNLIDAY_URL,
      referer: `${FUNLIDAY_URL}${refererPath}`,
      authorization: auth.authorization,
      cookie: auth.cookie,
      ...headers,
    },
    body,
  });

  const text = Buffer.from(await res.arrayBuffer()).toString('utf8');
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    // keep raw text as fallback
  }

  if (log) {
    log('nextApiRaw', {
      route,
      method,
      httpStatus: res.status,
      success: data && data.success,
    });
  }

  if (res.status !== 200) {
    throwApiError({
      route,
      httpStatus: res.status,
      status: 'NO_STATUS',
      message: data && data.message,
      text,
      code: 'FUNLIDAY_NEXT_API_ERROR',
    });
  }
  if (data && data.success === false) {
    throwApiError({
      route,
      httpStatus: res.status,
      status: 'success=false',
      message: data.message,
      text,
      code: 'FUNLIDAY_NEXT_API_ERROR',
    });
  }

  return {
    url,
    status: res.status,
    text,
    data,
  };
}

async function getTripContainer({ auth, tripId, log }) {
  if (!tripId) throw new FunlidayCliError('INVALID_INPUT', 'getTripContainer requires `tripId`.');
  const result = await callFunlidayNextApi({
    auth,
    route: `containers/${tripId}?_data=routes%2Fapi.next.containers.$containerId`,
    method: 'GET',
    refererPath: '/me/trips',
    log,
  });
  if (!result.data || result.data.success !== true || !result.data.data) {
    throw new FunlidayCliError('FUNLIDAY_NEXT_API_ERROR', `getTripContainer failed for ${tripId}: ${result.text.slice(0, 500)}`);
  }
  return {
    tripId,
    container: result.data.data,
    summary: summarizeTripContainer(result.data.data),
  };
}

async function updateTrip({ auth, tripId, name, dateStart, dateEnd, tripType, userCities, log }) {
  if (!tripId) throw new FunlidayCliError('INVALID_INPUT', 'updateTrip requires `tripId`.');
  if (!name) throw new FunlidayCliError('INVALID_INPUT', 'updateTrip requires `name`.');
  if (!dateStart) throw new FunlidayCliError('INVALID_INPUT', 'updateTrip requires `dateStart`.');
  if (!dateEnd) throw new FunlidayCliError('INVALID_INPUT', 'updateTrip requires `dateEnd`.');
  if (tripType === undefined || tripType === null || tripType === '') throw new FunlidayCliError('INVALID_INPUT', 'updateTrip requires `tripType`.');

  const form = {
    name,
    dateStart: formatTripDateForApi(dateStart),
    dateEnd: formatTripDateForApi(dateEnd),
    tripType: String(tripType),
  };
  if (Array.isArray(userCities) && userCities.length > 0) {
    form.userCities = JSON.stringify(userCities.map(String));
  }

  const encodedForm = new URLSearchParams(form).toString();
  const result = await callFunlidayNextApi({
    auth,
    route: `containers/${tripId}?_data=routes%2Fapi.next.containers.$containerId`,
    method: 'PUT',
    refererPath: '/me/trips',
    headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: encodedForm,
    log,
  });

  if (!result.data || result.data.success !== true || !result.data.data) {
    throw new FunlidayCliError('FUNLIDAY_NEXT_API_ERROR', `updateTrip failed for ${tripId}: ${result.text.slice(0, 500)}`);
  }

  return {
    tripId,
    request: {
      url: result.url,
      method: 'PUT',
      postData: encodedForm,
      fields: form,
    },
    container: result.data.data,
    summary: summarizeTripContainer(result.data.data),
    response: {
      url: result.url,
      status: result.status,
      body: result.data,
    },
  };
}

async function createTrip({ auth, name, userCities, dateStart, dateEnd, tripType, log }) {
  if (!name) throw new FunlidayCliError('INVALID_INPUT', 'createTrip requires `name`.');
  if (!Array.isArray(userCities) || userCities.length === 0) throw new FunlidayCliError('INVALID_INPUT', 'createTrip requires a non-empty `userCities` array.');
  if (!dateStart) throw new FunlidayCliError('INVALID_INPUT', 'createTrip requires `dateStart`.');
  if (!dateEnd) throw new FunlidayCliError('INVALID_INPUT', 'createTrip requires `dateEnd`.');
  if (tripType === undefined || tripType === null || tripType === '') throw new FunlidayCliError('INVALID_INPUT', 'createTrip requires `tripType`.');

  const result = await callFunlidayNextFormApi({
    auth,
    route: 'containers?_data=routes%2Fapi.next.containers',
    refererPath: '/me/trips',
    form: {
      name,
      userCities: JSON.stringify(userCities.map(String)),
      dateStart: formatTripDateForApi(dateStart),
      dateEnd: formatTripDateForApi(dateEnd),
      tripType: String(tripType),
    },
    log,
  });

  const tripId = result.response && result.response.data && result.response.data.id;
  if (!tripId) {
    throw new FunlidayCliError('FUNLIDAY_NEXT_API_ERROR', 'createTrip succeeded but did not return a trip ID.');
  }

  return {
    tripId,
    request: {
      url: result.url,
      method: 'POST',
      postData: new URLSearchParams(result.requestForm).toString(),
      fields: result.requestForm,
    },
    response: {
      url: result.url,
      status: 200,
      body: result.response,
    },
  };
}

async function getTrip({ auth, tripId, log }) {
  return (await callFunlidayApi({
    auth,
    apiName: 'getPoisOfTrip',
    body: { parseTripObjectId: tripId, deviceId: auth.deviceId },
    log,
  })).results;
}

function mapTripListResults(apiName, data) {
  const results = data && data.results;
  if (!results || !Array.isArray(results.trips)) {
    throw new FunlidayCliError('FUNLIDAY_API_ERROR', `${apiName} returned an unexpected payload (missing results.trips).`);
  }
  return {
    totalCount: Number(results.totalCount) || results.trips.length,
    skip: Number(results.skip) || 0,
    trips: results.trips,
  };
}

async function getTripList({ auth, skip = 0, limit = 100, log }) {
  const data = await callFunlidayApi({
    auth,
    apiName: 'getTripList',
    body: { deviceId: auth.deviceId, skip: String(skip), limit: String(limit) },
    log,
  });
  return mapTripListResults('getTripList', data);
}

async function getSharedTripList({ auth, skip = 0, limit = 100, log }) {
  const data = await callFunlidayApi({
    auth,
    apiName: 'getSharedTripList',
    body: { deviceId: auth.deviceId, skip: String(skip), limit: String(limit) },
    log,
  });
  return mapTripListResults('getSharedTripList', data);
}

async function deletePois({ auth, tripId, idArray, revision, log }) {
  return callFunlidayApi({
    auth,
    apiName: 'deletePois',
    body: {
      deviceId: auth.deviceId,
      parseTripObjectId: tripId,
      idArray,
      revision: String(revision),
    },
    log,
  });
}

async function addCustomPoi({ auth, tripId, daySequence, revision, poi, log, language }) {
  const requestLanguage = language || auth.language || process.env.FUNLIDAY_DEFAULT_LANGUAGE || 'zh_tw';
  return callFunlidayApi({
    auth,
    apiName: 'addPoi',
    body: {
      parseTripObjectId: tripId,
      daySequence: String(daySequence),
      revision: String(revision),
      transportationType: '4',
      addToCollections: '0',
      address: poi.address,
      name: poi.name,
      location: poi.location,
      dataSource: '4',
      stayTime: String(poi.stayTime),
      infoForPoiBank: {
        language: requestLanguage,
        name: poi.name,
        data: [{ id: poi.address, actionAt: String(Math.floor(Date.now() / 1000)) }],
      },
    },
    log,
  });
}

async function updatePoiStartTime({ auth, tripId, poiId, revision, customizeStartTime, stayTime, log }) {
  return callFunlidayApi({
    auth,
    apiName: 'updatePoiStartTime',
    body: {
      parseTripObjectId: tripId,
      parsePoiObjectId: poiId,
      revision: String(revision),
      customizeStartTime: String(customizeStartTime),
      stayTime: String(stayTime),
      deviceId: auth.deviceId,
    },
    log,
  });
}

async function getTextNote({ auth, tripId, poiId, log }) {
  return (await callFunlidayApi({
    auth,
    apiName: 'getTextNote',
    body: {
      deviceId: auth.deviceId,
      parseTripObjectId: tripId,
      parsePoiObjectId: poiId,
    },
    log,
  })).results;
}

async function postTextNote({ auth, tripId, poiId, textNote, textNoteObjectId, log }) {
  const body = {
    deviceId: auth.deviceId,
    parseTripObjectId: tripId,
    parsePoiObjectId: poiId,
    textNote,
  };
  if (textNoteObjectId) body.textNoteObjectId = textNoteObjectId;
  return callFunlidayApi({ auth, apiName: 'postTextNote', body, log });
}

function isPoibankPlaceholderRow(row) {
  if (!row || typeof row !== 'object') return false;
  return row.id === 99999999 || row.id === '99999999' || row.name === 'Please upgrade App';
}

async function searchPoibank({ auth, keyword, limit = 10, offset = 0 }) {
  if (!auth.poibankToken) {
    throw new FunlidayCliError('POIBANK_TOKEN_MISSING', 'Poibank token is missing from the provided auth context.');
  }

  const url = `${POIBANK_API_BASE}/poi/search?q=${encodeURIComponent(keyword)}&limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}&hl=${encodeURIComponent(auth.language || process.env.FUNLIDAY_DEFAULT_LANGUAGE || 'zh_tw')}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${auth.poibankToken}`,
    },
  });

  const text = await res.text();

  if (res.status !== 200) {
    throw new FunlidayCliError(
      'POIBANK_API_ERROR',
      `Poibank search failed: HTTP ${res.status} / ${text.slice(0, 500)}`,
      { httpStatus: res.status, responseText: text.slice(0, 500) },
    );
  }

  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    // not JSON
  }

  if (data && data.code !== undefined && data.code !== 1) {
    throw new FunlidayCliError(
      'POIBANK_API_ERROR',
      `Poibank search failed: code ${data.code} / ${data.code_message || text.slice(0, 500)}`,
      { code: data.code, codeMessage: data.code_message, responseText: text.slice(0, 500) },
    );
  }

  const results = data && Array.isArray(data.data) ? data.data : [];
  if (results.length > 0 && results.every(isPoibankPlaceholderRow)) {
    throw new FunlidayCliError(
      'POIBANK_ACCESS_UPGRADE_REQUIRED',
      `Poibank returned ${results.length} placeholder rows ("Please upgrade App") for keyword "${keyword}". The poibank token available to web sessions does not grant real POI data; POI search is unavailable with this token.`,
      {
        url,
        httpStatus: res.status,
        placeholderCount: results.length,
        hint: 'api.poibank.com only returns real POI data for upgraded App credentials; re-login or an App-issued token will not change this. Use trip-based endpoints (funliday-api / funliday-mutate) instead of poibank search.',
        responseText: text.slice(0, 500),
      },
    );
  }

  return {
    url,
    status: res.status,
    text,
    results,
  };
}

// --- City search (proxy/v2/autocomplete) ---

/**
 * The autocomplete `name` fields wrap matched substrings in <FUNLIDAY_SEARCH>
 * tags (site-side highlight markup); strip them for CLI output.
 */
function stripSearchTags(value) {
  return String(value || '').replace(/<\/?FUNLIDAY_SEARCH>/g, '').trim();
}

/** "zh_tw" -> "zh-TW" for the Accept-Language header that drives result language. */
function toAcceptLanguage(language) {
  const text = String(language || '').trim();
  const parts = text.split(/[-_]/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0].toLowerCase()}-${parts[1].toUpperCase()}`;
  return parts[0] ? parts[0].toLowerCase() : 'zh-TW';
}

function slimCityResult(item) {
  const extras = (item && item.extras && item.extras.city) || {};
  const city = extras.city || {};
  const name = stripSearchTags(city.name) || stripSearchTags(item && item.name);
  const displayParts = [
    name,
    extras.parent ? extras.parent.name : '',
    extras.country ? extras.country.name : '',
  ].filter(Boolean);
  const location = extras.location && typeof extras.location === 'object'
    ? { lat: Number(extras.location.lat), lng: Number(extras.location.lng) }
    : null;
  return {
    cityId: city.id ? String(city.id) : '',
    name,
    nameAlias: city.name_alias || (item && item.name_alias) || '',
    displayName: displayParts.join(', '),
    location,
    countryId: extras.country ? String(extras.country.id) : '',
    countryName: extras.country ? extras.country.name : '',
    parentId: extras.parent ? String(extras.parent.id) : '',
    parentName: extras.parent ? extras.parent.name : '',
  };
}

/**
 * Search Funliday's city list via the site's autocomplete proxy.
 *
 * `auth` is optional: the endpoint answers anonymously, but session headers are
 * forwarded when provided (works with an `--auth-file`, so sandboxes can use it).
 * Result name language follows `Accept-Language` (the `language` query param is
 * ignored server-side), derived from `auth.language` / `FUNLIDAY_DEFAULT_LANGUAGE`.
 */
async function searchCities({ auth, keyword, log }) {
  const text = String(keyword || '').trim();
  if (!text) throw new FunlidayCliError('INVALID_INPUT', 'searchCities requires a non-empty `keyword`.');

  const language = (auth && auth.language) || process.env.FUNLIDAY_DEFAULT_LANGUAGE || 'zh_tw';
  const url = `${FUNLIDAY_PROXY_API_BASE}/v2/autocomplete?q=${encodeURIComponent(text)}&type=city`;
  const headers = {
    accept: 'application/json, text/plain, */*',
    'accept-language': toAcceptLanguage(language),
    origin: FUNLIDAY_URL,
    referer: `${FUNLIDAY_URL}/me/trips`,
  };
  if (auth && auth.cookie) headers.cookie = auth.cookie;
  if (auth && auth.authorization) headers.authorization = auth.authorization;

  const res = await fetch(url, { headers });
  const bodyText = Buffer.from(await res.arrayBuffer()).toString('utf8');

  if (log) log('proxyApi', { route: 'v2/autocomplete', keyword: text, httpStatus: res.status });

  if (res.status !== 200) {
    throwApiError({
      route: 'proxy/v2/autocomplete',
      httpStatus: res.status,
      status: 'NO_STATUS',
      text: bodyText,
      code: 'FUNLIDAY_PROXY_API_ERROR',
    });
  }

  let data = null;
  try {
    data = JSON.parse(bodyText);
  } catch {
    // handled below
  }
  if (!Array.isArray(data)) {
    throw new FunlidayCliError('FUNLIDAY_PROXY_API_ERROR', `proxy/v2/autocomplete returned a non-array payload: ${bodyText.slice(0, 300)}`);
  }

  const results = data
    .filter((item) => item && item.type === 2)
    .map(slimCityResult)
    .filter((city) => city.cityId);

  return { url, status: res.status, results };
}

module.exports = {
  DEFAULT_CDP_ENDPOINT,
  FUNLIDAY_URL,
  createLogger,
  formatTripDateForApi,
  summarizeTripContainer,
  looksLikeAuthExpired,
  callFunlidayApi,
  callFunlidayNextApi,
  callFunlidayNextFormApi,
  getTripContainer,
  updateTrip,
  createTrip,
  getTrip,
  getTripList,
  getSharedTripList,
  searchCities,
  deletePois,
  addCustomPoi,
  updatePoiStartTime,
  getTextNote,
  postTextNote,
  searchPoibank,
};

