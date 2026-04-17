function summarizePoiForError(poi) {
  return {
    id: poi._id,
    name: poi.name,
    daySequence: poi.daySequence,
    seq: poi.poiSequenceIndex,
    startTime: poi.startTime,
    customizeStartTime: poi.customizeStartTime || null,
    stayTime: poi.stayTime,
    address: poi.address,
  };
}

function sortBySequence(a, b) {
  return Number(a.poiSequenceIndex) - Number(b.poiSequenceIndex);
}

function normalizeString(value) {
  return String(value == null ? '' : value);
}

function matchesRegex(value, pattern, flags = '') {
  return new RegExp(pattern, flags).test(normalizeString(value));
}

function matchLeafSelector(poi, selector, state) {
  if (selector.alias) {
    const aliasedId = state.aliases[selector.alias];
    if (!aliasedId || poi._id !== aliasedId) return false;
  }
  if (selector.id && poi._id !== selector.id) return false;
  if (selector.idIn && !selector.idIn.includes(poi._id)) return false;
  if (selector.name && poi.name !== selector.name) return false;
  if (selector.nameIn && !selector.nameIn.includes(poi.name)) return false;
  if (selector.nameContains && !normalizeString(poi.name).includes(selector.nameContains)) return false;
  if (selector.nameStartsWith && !normalizeString(poi.name).startsWith(selector.nameStartsWith)) return false;
  if (selector.nameEndsWith && !normalizeString(poi.name).endsWith(selector.nameEndsWith)) return false;
  if (selector.nameRegex && !matchesRegex(poi.name, selector.nameRegex, selector.nameRegexFlags || '')) return false;
  if (selector.address && poi.address !== selector.address) return false;
  if (selector.addressContains && !normalizeString(poi.address).includes(selector.addressContains)) return false;
  if (selector.addressStartsWith && !normalizeString(poi.address).startsWith(selector.addressStartsWith)) return false;
  if (selector.addressEndsWith && !normalizeString(poi.address).endsWith(selector.addressEndsWith)) return false;
  if (selector.addressRegex && !matchesRegex(poi.address, selector.addressRegex, selector.addressRegexFlags || '')) return false;
  if (selector.daySequence !== undefined && Number(poi.daySequence) !== Number(selector.daySequence)) return false;
  if (selector.daySequenceIn && !selector.daySequenceIn.map(Number).includes(Number(poi.daySequence))) return false;
  if (selector.seq !== undefined && Number(poi.poiSequenceIndex) !== Number(selector.seq)) return false;
  if (selector.seqGte !== undefined && !(Number(poi.poiSequenceIndex) >= Number(selector.seqGte))) return false;
  if (selector.seqLte !== undefined && !(Number(poi.poiSequenceIndex) <= Number(selector.seqLte))) return false;
  if (selector.startTime !== undefined && normalizeString(poi.startTime) !== normalizeString(selector.startTime)) return false;
  if (selector.startTimeGte !== undefined && !(Number(poi.startTime) >= Number(selector.startTimeGte))) return false;
  if (selector.startTimeLte !== undefined && !(Number(poi.startTime) <= Number(selector.startTimeLte))) return false;
  if (selector.customizeStartTime !== undefined && normalizeString(poi.customizeStartTime || '') !== normalizeString(selector.customizeStartTime)) return false;
  if (selector.stayTime !== undefined && normalizeString(poi.stayTime) !== normalizeString(selector.stayTime)) return false;
  if (selector.stayTimeGte !== undefined && !(Number(poi.stayTime) >= Number(selector.stayTimeGte))) return false;
  if (selector.stayTimeLte !== undefined && !(Number(poi.stayTime) <= Number(selector.stayTimeLte))) return false;
  if (selector.hasNote !== undefined) {
    const hasNote = Boolean(poi.textNote);
    if (hasNote !== Boolean(selector.hasNote)) return false;
  }
  return true;
}

function matchesSelector(poi, selector, state) {
  if (!selector) return true;
  if (typeof selector === 'string') {
    const aliasedId = state.aliases[selector];
    return aliasedId ? poi._id === aliasedId : poi.name === selector;
  }

  if (selector.any) return selector.any.some((child) => matchesSelector(poi, child, state));
  if (selector.all) return selector.all.every((child) => matchesSelector(poi, child, state));
  if (selector.not) return !matchesSelector(poi, selector.not, state);

  return matchLeafSelector(poi, selector, state);
}

function applyCardinalitySelectors(matches, selector) {
  if (!selector || typeof selector !== 'object') return matches;
  const sorted = [...matches].sort(sortBySequence);
  if (selector.first === true) return sorted.length ? [sorted[0]] : [];
  if (selector.last === true) return sorted.length ? [sorted[sorted.length - 1]] : [];
  if (selector.nth !== undefined) {
    const index = Number(selector.nth);
    return Number.isInteger(index) && index >= 0 && index < sorted.length ? [sorted[index]] : [];
  }
  if (selector.limit !== undefined) return sorted.slice(0, Number(selector.limit));
  return sorted;
}

function findPois(trip, selector, state) {
  const matches = trip.pois.filter((poi) => matchesSelector(poi, selector, state));
  return applyCardinalitySelectors(matches, selector);
}

function resolveSinglePoi(trip, selector, state, { required = true, label = 'selector' } = {}) {
  const matches = findPois(trip, selector, state);
  if (matches.length === 0) {
    if (!required) return null;
    throw new Error(`No POI matched ${label}: ${JSON.stringify(selector)}`);
  }
  if (matches.length > 1) {
    throw new Error(`Selector ${label} matched multiple POIs: ${JSON.stringify(matches.map((poi) => summarizePoiForError(poi)))}`);
  }
  return matches[0];
}

module.exports = {
  findPois,
  matchesSelector,
  resolveSinglePoi,
  sortBySequence,
  summarizePoiForError,
};

