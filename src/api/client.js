const { DEFAULT_CDP_ENDPOINT, FUNLIDAY_URL } = require('../auth/browser-session');
const { FunlidayCliError } = require('../errors');

const FUNLIDAY_API_BASE = 'https://www.funlidays.com/api';
const FUNLIDAY_NEXT_API_BASE = `${FUNLIDAY_URL}/api/next`;
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
    throw new FunlidayCliError(
      'FUNLIDAY_API_ERROR',
      `${apiName} failed: HTTP ${res.status} / ${(data && data.status) || 'NO_STATUS'} / ${(data && data.message) || text.slice(0, 500)}`,
      { apiName, httpStatus: res.status, responseText: text.slice(0, 500) },
    );
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
    throw new FunlidayCliError(
      'FUNLIDAY_NEXT_API_ERROR',
      `${route} failed: HTTP ${res.status} / ${(data && data.success) || 'NO_SUCCESS'} / ${text.slice(0, 500)}`,
      { route, httpStatus: res.status, responseText: text.slice(0, 500) },
    );
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
    throw new FunlidayCliError('FUNLIDAY_NEXT_API_ERROR', `${route} failed: HTTP ${res.status} / ${text.slice(0, 500)}`);
  }
  if (data && data.success === false) {
    throw new FunlidayCliError('FUNLIDAY_NEXT_API_ERROR', `${route} failed: success=false / ${text.slice(0, 500)}`);
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

  return {
    url,
    status: res.status,
    text,
  };
}

module.exports = {
  DEFAULT_CDP_ENDPOINT,
  FUNLIDAY_URL,
  createLogger,
  formatTripDateForApi,
  summarizeTripContainer,
  callFunlidayApi,
  callFunlidayNextApi,
  callFunlidayNextFormApi,
  getTripContainer,
  updateTrip,
  createTrip,
  getTrip,
  deletePois,
  addCustomPoi,
  updatePoiStartTime,
  getTextNote,
  postTextNote,
  searchPoibank,
};

