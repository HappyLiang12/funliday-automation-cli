const path = require('path');
const {
  DEFAULT_CDP_ENDPOINT,
  createLogger,
  getTrip,
  deletePois,
  addCustomPoi,
  updatePoiStartTime,
  getTextNote,
  postTextNote,
} = require('../api/client');
const { ensureFunlidaySessionPage, extractFunlidayAuth } = require('../auth/browser-session');
const { resolveArtifactPath, writeJson } = require('../io/paths');
const { findPois, resolveSinglePoi, sortBySequence } = require('./selector');
const { validateMutationPlan } = require('./validator');
const { createExecutionReview, summarizeExecutionReviews } = require('../observability/execution-review');
const { normalizeAuth } = require('../auth/env-auth');

function summarizePoi(poi) {
  return {
    id: poi._id,
    name: poi.name,
    daySequence: poi.daySequence,
    seq: poi.poiSequenceIndex,
    startTime: poi.startTime,
    customizeStartTime: poi.customizeStartTime || null,
    stayTime: poi.stayTime,
    address: poi.address,
    noteId: poi.textNote ? poi.textNote._id : null,
  };
}

function summarizeTrip(trip) {
  return {
    revision: trip.revision,
    totalCount: trip.totalCount,
    pois: trip.pois.map(summarizePoi),
  };
}

function getDayPois(trip, daySequence) {
  return trip.pois
    .filter((poi) => Number(poi.daySequence) === Number(daySequence))
    .sort(sortBySequence);
}

function getDayNames(trip, daySequence) {
  return getDayPois(trip, daySequence).map((poi) => poi.name);
}

function buildDefaultOutputPath(planPath) {
  const baseName = path.basename(planPath, path.extname(planPath));
  return resolveArtifactPath('mutations', `${baseName}_output.json`);
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function toTripLikeSummary(trip) {
  return clone(trip);
}

function nextSyntheticId(state, prefix = 'dryrun-poi') {
  state.syntheticCounter += 1;
  return `${prefix}-${state.syntheticCounter}`;
}

function mutateVirtualTrip(state, updater) {
  if (!state.dryRun) return;
  if (!state.trip) {
    throw new Error('Virtual trip state is not initialized.');
  }
  updater(state.trip);
}

function summarizeOperationContext(operation, state) {
  return {
    type: operation.type,
    tripId: state.tripId,
    dryRun: state.dryRun,
  };
}

function inferSuccessSignals(operation, result, state) {
  return {
    usedWorkaround: operation.type === 'rebuildDaySegmentInOrder' && result && result.fixed === true,
    sharedHelperUsed: true,
    manualFollowUp: false,
    dryRun: state.dryRun === true,
  };
}

function inferFailureSignals(operation, error) {
  const message = String(error && error.message ? error.message : error || '');
  return {
    guardrailTriggered: /did not resolve any target IDs|requires textNote or copyFrom|requires selector, alias, or name|assertDayOrder failed|verification failed/i.test(message),
    validationRejected: /validation failed/i.test(message),
    sharedHelperUsed: true,
  };
}

async function ensureTrip(state) {
  if (!state.trip) {
    state.trip = await state.adapters.getTrip({ auth: state.auth, tripId: state.tripId, log: state.log });
  }
  return state.trip;
}

async function refreshTrip(state) {
  if (state.dryRun && state.trip) return state.trip;
  state.trip = await state.adapters.getTrip({ auth: state.auth, tripId: state.tripId, log: state.log });
  return state.trip;
}

async function maybeReadNoteText(state, poi, shouldRead) {
  if (!shouldRead || !poi || !poi.textNote) return '';
  if (state.dryRun && poi.textNote && typeof poi.textNote.text === 'string') {
    return poi.textNote.text;
  }
  const note = await state.adapters.getTextNote({ auth: state.auth, tripId: state.tripId, poiId: poi._id, log: state.log });
  return note && typeof note.text === 'string' ? note.text : '';
}

function ensureVirtualDayOrder(state, daySequence) {
  const dayPois = getDayPois(state.trip, daySequence);
  dayPois.forEach((poi, index) => {
    poi.poiSequenceIndex = 10 + index;
  });
  state.trip.totalCount = String(state.trip.pois.length);
  state.trip.revision = String(Number(state.trip.revision || 0) + 1);
}

async function opReadTrip(operation, state) {
  const trip = await refreshTrip(state);
  const summary = summarizeTrip(trip);
  if (operation.saveAs) state.named[operation.saveAs] = summary;
  return {
    type: operation.type,
    saveAs: operation.saveAs || null,
    revision: trip.revision,
    totalCount: trip.totalCount,
  };
}

async function opAssertDayOrder(operation, state) {
  const trip = await ensureTrip(state);
  const allNames = getDayNames(trip, operation.daySequence);
  const expected = operation.expectedNames || [];
  const mode = operation.mode || 'tail';
  let actual = mode === 'exact' ? allNames : allNames.slice(-expected.length);
  if (operation.subsequence === true && mode === 'exact') {
    let cursor = 0;
    actual = [];
    for (const name of allNames) {
      if (cursor < expected.length && name === expected[cursor]) {
        actual.push(name);
        cursor += 1;
      }
    }
  }
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`assertDayOrder failed for day ${operation.daySequence}. Expected ${expected.join(' -> ')}, got ${actual.join(' -> ')}`);
  }
  return {
    type: operation.type,
    daySequence: operation.daySequence,
    mode,
    subsequence: operation.subsequence === true,
    actual,
  };
}

async function opDeletePois(operation, state) {
  const trip = await ensureTrip(state);
  const ids = new Set();

  for (const id of operation.ids || []) ids.add(id);
  for (const selector of operation.selectors || (operation.selector ? [operation.selector] : [])) {
    for (const poi of findPois(trip, selector, state)) ids.add(poi._id);
  }

  const idArray = [...ids];
  if (idArray.length === 0) {
    if (operation.required !== false) throw new Error('deletePois did not resolve any target IDs.');
    return { type: operation.type, deletedIds: [] };
  }

  if (!state.dryRun) {
    await state.adapters.deletePois({ auth: state.auth, tripId: state.tripId, idArray, revision: trip.revision, log: state.log });
    await refreshTrip(state);
  } else {
    mutateVirtualTrip(state, (virtualTrip) => {
      virtualTrip.pois = virtualTrip.pois.filter((poi) => !idArray.includes(poi._id));
      const daySequences = [...new Set(virtualTrip.pois.map((poi) => poi.daySequence))];
      daySequences.forEach((daySequence) => ensureVirtualDayOrder(state, daySequence));
    });
  }

  return {
    type: operation.type,
    deletedIds: idArray,
    dryRun: state.dryRun,
  };
}

async function opAddCustomPoi(operation, state) {
  const trip = await ensureTrip(state);
  const beforeIds = new Set(trip.pois.map((poi) => poi._id));

  if (state.dryRun) {
    const created = {
      _id: nextSyntheticId(state),
      name: operation.poi.name,
      daySequence: Number(operation.daySequence),
      poiSequenceIndex: 9999,
      startTime: null,
      customizeStartTime: null,
      stayTime: String(operation.poi.stayTime),
      address: operation.poi.address,
      location: clone(operation.poi.location),
      textNote: null,
    };
    mutateVirtualTrip(state, (virtualTrip) => {
      virtualTrip.pois.push(created);
      ensureVirtualDayOrder(state, operation.daySequence);
    });
    const inserted = state.trip.pois.find((poi) => !beforeIds.has(poi._id) && poi.name === operation.poi.name);
    if (operation.alias) state.aliases[operation.alias] = inserted._id;
    return {
      type: operation.type,
      alias: operation.alias || null,
      dryRun: true,
      poi: summarizePoi(inserted),
    };
  }

  await state.adapters.addCustomPoi({
    auth: state.auth,
    tripId: state.tripId,
    daySequence: operation.daySequence,
    revision: trip.revision,
    poi: operation.poi,
    log: state.log,
  });
  const updatedTrip = await refreshTrip(state);
  const created = updatedTrip.pois.find((poi) => !beforeIds.has(poi._id) && poi.name === operation.poi.name);
  if (!created) throw new Error(`Failed to detect added POI: ${operation.poi.name}`);
  if (operation.alias) state.aliases[operation.alias] = created._id;

  return {
    type: operation.type,
    alias: operation.alias || null,
    poi: summarizePoi(created),
  };
}

async function opUpdatePoiStartTime(operation, state) {
  const trip = await ensureTrip(state);
  const poi = resolveSinglePoi(trip, operation.selector || operation.alias || operation.name, state, { label: 'updatePoiStartTime' });
  const customizeStartTime = operation.customizeStartTime !== undefined ? operation.customizeStartTime : (poi.customizeStartTime || poi.startTime);
  const stayTime = operation.stayTime !== undefined ? operation.stayTime : poi.stayTime;

  if (!state.dryRun) {
    await state.adapters.updatePoiStartTime({
      auth: state.auth,
      tripId: state.tripId,
      poiId: poi._id,
      revision: trip.revision,
      customizeStartTime,
      stayTime,
      log: state.log,
    });
    await refreshTrip(state);
  } else {
    mutateVirtualTrip(state, (virtualTrip) => {
      const target = virtualTrip.pois.find((item) => item._id === poi._id);
      target.customizeStartTime = String(customizeStartTime);
      target.stayTime = String(stayTime);
      target.startTime = String(customizeStartTime);
      virtualTrip.revision = String(Number(virtualTrip.revision || 0) + 1);
    });
  }

  return {
    type: operation.type,
    poiId: poi._id,
    customizeStartTime: String(customizeStartTime),
    stayTime: String(stayTime),
    dryRun: state.dryRun,
  };
}

async function opPostNote(operation, state) {
  const trip = await ensureTrip(state);
  const target = resolveSinglePoi(trip, operation.selector || operation.alias || operation.name, state, { label: 'postNote target' });
  let textNote = operation.textNote || '';

  if (!textNote && operation.copyFrom) {
    const source = resolveSinglePoi(trip, operation.copyFrom, state, { label: 'postNote copyFrom' });
    textNote = await maybeReadNoteText(state, source, true);
  }
  if (!textNote) throw new Error('postNote requires textNote or copyFrom with an existing note.');

  if (!state.dryRun) {
    await state.adapters.postTextNote({
      auth: state.auth,
      tripId: state.tripId,
      poiId: target._id,
      textNote,
      textNoteObjectId: target.textNote ? target.textNote._id : undefined,
      log: state.log,
    });
    await refreshTrip(state);
  } else {
    mutateVirtualTrip(state, (virtualTrip) => {
      const item = virtualTrip.pois.find((poi) => poi._id === target._id);
      const noteId = item.textNote && item.textNote._id ? item.textNote._id : nextSyntheticId(state, 'dryrun-note');
      item.textNote = { _id: noteId, text: textNote };
      virtualTrip.revision = String(Number(virtualTrip.revision || 0) + 1);
    });
  }

  return {
    type: operation.type,
    poiId: target._id,
    noteLength: textNote.length,
    dryRun: state.dryRun,
  };
}

async function opRebuildDaySegmentInOrder(operation, state) {
  let trip = await ensureTrip(state);
  const expectedNames = operation.items.map((item) => item.name || (item.fallbackPoi && item.fallbackPoi.name));
  const currentDayNames = getDayNames(trip, operation.daySequence);
  const actualSegment = (operation.verifyMode || 'tail') === 'exact'
    ? currentDayNames
    : currentDayNames.slice(-expectedNames.length);

  const itemSnapshots = [];
  for (const item of operation.items) {
    const selector = item.selector || item.alias || item.name;
    const livePoi = selector ? resolveSinglePoi(trip, selector, state, { label: `rebuild item ${item.name}`, required: item.required !== false }) : null;
    const fallbackPoi = item.fallbackPoi || {};
    const noteText = await maybeReadNoteText(state, livePoi, item.preserveNote !== false);

    itemSnapshots.push({
      alias: item.alias || item.key || null,
      name: item.name || (livePoi && livePoi.name) || fallbackPoi.name,
      originalId: livePoi ? livePoi._id : null,
      address: livePoi ? livePoi.address : fallbackPoi.address,
      location: livePoi ? livePoi.location : fallbackPoi.location,
      stayTime: livePoi && livePoi.stayTime ? String(livePoi.stayTime) : String(fallbackPoi.stayTime || ''),
      customizeStartTime: livePoi && livePoi.customizeStartTime ? String(livePoi.customizeStartTime) : String(fallbackPoi.customizeStartTime || ''),
      noteText,
      preserveNote: item.preserveNote !== false,
      required: item.required !== false,
    });
  }

  const sentinelName = itemSnapshots[0] ? itemSnapshots[0].name : '';
  const wrongDayExists = sentinelName
    ? trip.pois.some((poi) => poi.name === sentinelName && Number(poi.daySequence) !== Number(operation.daySequence))
    : false;
  const shouldFix = operation.force === true || wrongDayExists || JSON.stringify(actualSegment) !== JSON.stringify(expectedNames);

  const recreated = [];
  if (shouldFix) {
    const idsToDelete = itemSnapshots.map((item) => item.originalId).filter(Boolean);
    if (idsToDelete.length) {
      await opDeletePois({ type: 'deletePois', ids: idsToDelete, required: false }, state);
      trip = await refreshTrip(state);
    }

    for (const item of itemSnapshots) {
      const addResult = await opAddCustomPoi({
        type: 'addCustomPoi',
        alias: item.alias,
        daySequence: operation.daySequence,
        poi: {
          name: item.name,
          address: item.address,
          location: item.location,
          stayTime: item.stayTime,
        },
      }, state);
      const poiId = addResult.poi.id;
      await opUpdatePoiStartTime({
        type: 'updatePoiStartTime',
        selector: item.alias ? { alias: item.alias } : { id: poiId },
        customizeStartTime: item.customizeStartTime,
        stayTime: item.stayTime,
      }, state);
      if (item.noteText && item.preserveNote) {
        await opPostNote({
          type: 'postNote',
          selector: item.alias ? { alias: item.alias } : { id: poiId },
          textNote: item.noteText,
        }, state);
      }
      trip = await refreshTrip(state);
      const created = trip.pois.find((poi) => poi._id === poiId);
      recreated.push({ alias: item.alias, poi: summarizePoi(created) });
    }
  } else {
    for (const item of itemSnapshots) {
      if (item.alias && item.originalId) state.aliases[item.alias] = item.originalId;
    }
  }

  trip = await refreshTrip(state);
  const finalNames = getDayNames(trip, operation.daySequence);
  const finalSegment = (operation.verifyMode || 'tail') === 'exact'
    ? finalNames
    : finalNames.slice(-expectedNames.length);
  if (JSON.stringify(finalSegment) !== JSON.stringify(expectedNames)) {
    throw new Error(`rebuildDaySegmentInOrder verification failed. Expected ${expectedNames.join(' -> ')}, got ${finalSegment.join(' -> ')}`);
  }

  return {
    type: operation.type,
    daySequence: operation.daySequence,
    verifyMode: operation.verifyMode || 'tail',
    fixed: shouldFix,
    expectedNames,
    finalSegment,
    recreated,
    dryRun: state.dryRun,
  };
}

const OPERATION_HANDLERS = {
  readTrip: opReadTrip,
  assertDayOrder: opAssertDayOrder,
  deletePois: opDeletePois,
  addCustomPoi: opAddCustomPoi,
  updatePoiStartTime: opUpdatePoiStartTime,
  postNote: opPostNote,
  rebuildDaySegmentInOrder: opRebuildDaySegmentInOrder,
};

async function resolveAuth({ auth, endpoint }) {
  if (auth) return normalizeAuth(auth);
  const { browser, page } = await ensureFunlidaySessionPage({ endpoint });
  const browserAuth = await extractFunlidayAuth(page);
  return { auth: browserAuth, browser };
}

function isOfflineDryRun(plan, dryRun) {
  return Boolean(dryRun && plan && plan.tripSnapshot && Array.isArray(plan.tripSnapshot.pois));
}

async function runMutationPlan({ plan, endpoint = DEFAULT_CDP_ENDPOINT, dryRun = false, outputPath, auth, adapters = {} } = {}) {
  const validation = validateMutationPlan(plan);
  if (!validation.ok) {
    const errorText = validation.errors.map((item) => `${item.path}: ${item.message}`).join('\n');
    throw new Error(`Mutation plan validation failed:\n${errorText}`);
  }

  const { logs, log } = createLogger();
  const offline = isOfflineDryRun(plan, dryRun);
  const resolved = offline ? { auth: { cookie: 'offline', authorization: 'Bearer offline', deviceId: 'offline', language: 'zh_tw' } } : await resolveAuth({ auth, endpoint: plan.endpoint || endpoint });
  const state = {
    auth: resolved.auth || resolved,
    tripId: plan.tripId,
    trip: null,
    aliases: {},
    named: {},
    dryRun,
    logs,
    log,
    operationReviews: [],
    syntheticCounter: 0,
    adapters: {
      getTrip: adapters.getTrip || getTrip,
      deletePois: adapters.deletePois || deletePois,
      addCustomPoi: adapters.addCustomPoi || addCustomPoi,
      updatePoiStartTime: adapters.updatePoiStartTime || updatePoiStartTime,
      getTextNote: adapters.getTextNote || getTextNote,
      postTextNote: adapters.postTextNote || postTextNote,
    },
  };

  const operationResults = [];
  let currentOperation = null;
  let browser = resolved.browser || null;
  try {
    if (offline) {
      state.trip = clone(plan.tripSnapshot);
    } else {
      state.trip = await state.adapters.getTrip({ auth: state.auth, tripId: state.tripId, log: state.log });
    }
    if (state.dryRun) {
      state.trip = toTripLikeSummary(state.trip);
    }

    for (const operation of plan.operations) {
      currentOperation = operation;
      const handler = OPERATION_HANDLERS[operation.type];
      if (!handler) throw new Error(`Unsupported operation type: ${operation.type}`);
      try {
        const result = await handler(operation, state);
        operationResults.push(result);
        const review = createExecutionReview({
          domain: 'funliday-mutation-runner',
          operation: operation.type,
          ok: true,
          context: {
            ...summarizeOperationContext(operation, state),
            resultSummary: result,
          },
          signals: inferSuccessSignals(operation, result, state),
        });
        state.operationReviews.push(review);
        log('operationComplete', { type: operation.type, result });
        log('operationReview', { type: operation.type, review });
      } catch (error) {
        const review = createExecutionReview({
          domain: 'funliday-mutation-runner',
          operation: operation.type,
          ok: false,
          error,
          context: summarizeOperationContext(operation, state),
          signals: inferFailureSignals(operation, error),
        });
        state.operationReviews.push(review);
        log('operationReview', { type: operation.type, review });
        throw error;
      }
    }

    const finalTrip = await refreshTrip(state);
    const finalResult = {
      ok: true,
      plan: {
        version: plan.version || 1,
        description: plan.description || '',
        tripId: plan.tripId,
      },
      endpoint: plan.endpoint || endpoint,
      dryRun,
      aliases: state.aliases,
      named: state.named,
      operations: operationResults,
      operationReviews: state.operationReviews,
      executionReviewSummary: summarizeExecutionReviews(state.operationReviews),
      finalTrip: summarizeTrip(finalTrip),
      logs,
    };

    if (outputPath || plan.outputPath || plan.__planPath) {
      writeJson(outputPath || plan.outputPath || buildDefaultOutputPath(plan.__planPath || 'mutation_plan.json'), finalResult);
    }
    if (browser) await browser.close();
    return finalResult;
  } catch (error) {
    const failure = {
      ok: false,
      plan: {
        version: plan.version || 1,
        description: plan.description || '',
        tripId: plan.tripId,
      },
      endpoint: plan.endpoint || endpoint,
      dryRun,
      aliases: state.aliases,
      named: state.named,
      operations: operationResults,
      operationReviews: state.operationReviews,
      executionReviewSummary: summarizeExecutionReviews(state.operationReviews),
      failureReview: currentOperation ? state.operationReviews[state.operationReviews.length - 1] : createExecutionReview({
        domain: 'funliday-mutation-runner',
        operation: 'runMutationPlan',
        ok: false,
        error,
        context: { tripId: state.tripId, dryRun: state.dryRun },
        signals: { sharedHelperUsed: true },
      }),
      error: String(error && error.stack ? error.stack : error),
      logs,
    };
    if (outputPath || plan.outputPath || plan.__planPath) {
      writeJson(outputPath || plan.outputPath || buildDefaultOutputPath(plan.__planPath || 'mutation_plan.json'), failure);
    }
    if (browser) await browser.close();
    throw error;
  }
}

module.exports = {
  runMutationPlan,
  validateMutationPlan,
  summarizeTrip,
  summarizePoi,
  getDayPois,
  getDayNames,
};


