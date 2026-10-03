const { isValidStartTimeValue } = require('./time');

const ALLOWED_TOP_LEVEL_FIELDS = new Set(['version', 'description', 'tripId', 'endpoint', 'outputPath', 'operations', 'tripSnapshot']);
const SELECTOR_LEAF_FIELDS = new Set([
  'alias', 'id', 'idIn', 'name', 'nameIn', 'nameContains', 'nameStartsWith', 'nameEndsWith', 'nameRegex', 'nameRegexFlags',
  'address', 'addressContains', 'addressStartsWith', 'addressEndsWith', 'addressRegex', 'addressRegexFlags',
  'daySequence', 'daySequenceIn', 'seq', 'seqGte', 'seqLte',
  'startTime', 'startTimeGte', 'startTimeLte',
  'customizeStartTime',
  'stayTime', 'stayTimeGte', 'stayTimeLte',
  'hasNote',
]);
const SELECTOR_CARDINALITY_FIELDS = new Set(['first', 'last', 'nth', 'limit']);
const SELECTOR_COMPOSITE_FIELDS = new Set(['any', 'all', 'not']);
const OPERATION_REQUIRED_FIELDS = {
  readTrip: [],
  assertDayOrder: ['daySequence', 'expectedNames'],
  deletePois: [],
  addCustomPoi: ['daySequence', 'poi'],
  updatePoiStartTime: [],
  postNote: [],
  rebuildDaySegmentInOrder: ['daySequence', 'items'],
};
const ALLOWED_OPERATION_FIELDS = {
  readTrip: new Set(['type', 'saveAs']),
  assertDayOrder: new Set(['type', 'daySequence', 'mode', 'subsequence', 'expectedNames']),
  deletePois: new Set(['type', 'ids', 'selectors', 'selector', 'required']),
  addCustomPoi: new Set(['type', 'alias', 'daySequence', 'poi']),
  updatePoiStartTime: new Set(['type', 'selector', 'alias', 'name', 'customizeStartTime', 'stayTime']),
  postNote: new Set(['type', 'selector', 'alias', 'name', 'textNote', 'copyFrom']),
  rebuildDaySegmentInOrder: new Set(['type', 'daySequence', 'verifyMode', 'force', 'items']),
};

function pushError(errors, path, message) {
  errors.push({ path, message });
}

function validateSelector(selector, path, errors) {
  if (typeof selector === 'string') return;
  if (!selector || typeof selector !== 'object' || Array.isArray(selector)) {
    pushError(errors, path, 'Selector must be a string or object.');
    return;
  }

  const keys = Object.keys(selector);
  const unknownKeys = keys.filter((key) => !SELECTOR_LEAF_FIELDS.has(key) && !SELECTOR_COMPOSITE_FIELDS.has(key) && !SELECTOR_CARDINALITY_FIELDS.has(key));
  for (const key of unknownKeys) pushError(errors, `${path}.${key}`, 'Unknown selector field.');

  const hasComposite = keys.some((key) => SELECTOR_COMPOSITE_FIELDS.has(key));
  const hasLeaf = keys.some((key) => SELECTOR_LEAF_FIELDS.has(key));
  if (hasComposite && hasLeaf) {
    pushError(errors, path, 'Composite selectors (`any`, `all`, `not`) cannot be mixed with leaf selector fields at the same level.');
  }

  if (selector.any !== undefined) {
    if (!Array.isArray(selector.any) || selector.any.length === 0) {
      pushError(errors, `${path}.any`, '`any` must be a non-empty array of selectors.');
    } else {
      selector.any.forEach((child, index) => validateSelector(child, `${path}.any[${index}]`, errors));
    }
  }
  if (selector.all !== undefined) {
    if (!Array.isArray(selector.all) || selector.all.length === 0) {
      pushError(errors, `${path}.all`, '`all` must be a non-empty array of selectors.');
    } else {
      selector.all.forEach((child, index) => validateSelector(child, `${path}.all[${index}]`, errors));
    }
  }
  if (selector.not !== undefined) validateSelector(selector.not, `${path}.not`, errors);

  if (selector.idIn !== undefined && !Array.isArray(selector.idIn)) pushError(errors, `${path}.idIn`, '`idIn` must be an array.');
  if (selector.nameIn !== undefined && !Array.isArray(selector.nameIn)) pushError(errors, `${path}.nameIn`, '`nameIn` must be an array.');
  if (selector.daySequenceIn !== undefined && !Array.isArray(selector.daySequenceIn)) pushError(errors, `${path}.daySequenceIn`, '`daySequenceIn` must be an array.');
  if (selector.nth !== undefined && (!Number.isInteger(selector.nth) || selector.nth < 0)) pushError(errors, `${path}.nth`, '`nth` must be a non-negative integer.');
  if (selector.limit !== undefined && (!Number.isInteger(selector.limit) || selector.limit <= 0)) pushError(errors, `${path}.limit`, '`limit` must be a positive integer.');
  if (selector.first === true && selector.last === true) pushError(errors, path, '`first` and `last` cannot both be true.');
  if (selector.nth !== undefined && (selector.first === true || selector.last === true)) pushError(errors, path, '`nth` cannot be combined with `first` or `last`.');
}

function validatePoiPayload(poi, path, errors) {
  if (!poi || typeof poi !== 'object' || Array.isArray(poi)) {
    pushError(errors, path, 'POI payload must be an object.');
    return;
  }
  for (const field of ['name', 'address', 'location', 'stayTime']) {
    if (poi[field] === undefined || poi[field] === null || poi[field] === '') {
      pushError(errors, `${path}.${field}`, `Missing required POI field: ${field}`);
    }
  }
  if (!poi.location || typeof poi.location !== 'object') {
    pushError(errors, `${path}.location`, 'location must be an object with lat/lng.');
  } else {
    if (typeof poi.location.lat !== 'number') pushError(errors, `${path}.location.lat`, 'lat must be a number.');
    if (typeof poi.location.lng !== 'number') pushError(errors, `${path}.location.lng`, 'lng must be a number.');
  }
  if (poi.customizeStartTime !== undefined && poi.customizeStartTime !== null && poi.customizeStartTime !== '' && !isValidStartTimeValue(poi.customizeStartTime)) {
    pushError(errors, `${path}.customizeStartTime`, '`customizeStartTime` must be seconds since midnight (integer or numeric string) or "HH:MM".');
  }
}

function validateOperation(operation, index, errors) {
  const path = `operations[${index}]`;
  if (!operation || typeof operation !== 'object' || Array.isArray(operation)) {
    pushError(errors, path, 'Operation must be an object.');
    return;
  }
  if (!operation.type || typeof operation.type !== 'string') {
    pushError(errors, `${path}.type`, 'Operation type is required.');
    return;
  }
  if (!OPERATION_REQUIRED_FIELDS[operation.type]) {
    pushError(errors, `${path}.type`, `Unsupported operation type: ${operation.type}`);
    return;
  }

  const allowedFields = ALLOWED_OPERATION_FIELDS[operation.type];
  for (const key of Object.keys(operation)) {
    if (!allowedFields.has(key)) pushError(errors, `${path}.${key}`, `Unknown field for operation ${operation.type}.`);
  }

  for (const requiredField of OPERATION_REQUIRED_FIELDS[operation.type]) {
    if (operation[requiredField] === undefined) pushError(errors, `${path}.${requiredField}`, `Missing required field for ${operation.type}.`);
  }

  if (operation.type === 'assertDayOrder') {
    if (!Array.isArray(operation.expectedNames) || operation.expectedNames.length === 0) pushError(errors, `${path}.expectedNames`, '`expectedNames` must be a non-empty array.');
    if (operation.mode !== undefined && !['tail', 'exact'].includes(operation.mode)) pushError(errors, `${path}.mode`, '`mode` must be `tail` or `exact`.');
    if (operation.subsequence !== undefined && typeof operation.subsequence !== 'boolean') pushError(errors, `${path}.subsequence`, '`subsequence` must be a boolean when provided.');
  }

  if (operation.type === 'deletePois') {
    const hasIds = Array.isArray(operation.ids) && operation.ids.length > 0;
    const hasSelector = operation.selector !== undefined || (Array.isArray(operation.selectors) && operation.selectors.length > 0);
    if (!hasIds && !hasSelector) pushError(errors, path, 'deletePois requires ids and/or selector(s).');
    if (operation.selector !== undefined) validateSelector(operation.selector, `${path}.selector`, errors);
    if (Array.isArray(operation.selectors)) operation.selectors.forEach((selector, idx) => validateSelector(selector, `${path}.selectors[${idx}]`, errors));
  }

  if (operation.type === 'addCustomPoi') validatePoiPayload(operation.poi, `${path}.poi`, errors);

  if (operation.type === 'updatePoiStartTime') {
    const hasTarget = operation.selector !== undefined || operation.alias !== undefined || operation.name !== undefined;
    if (!hasTarget) pushError(errors, path, 'updatePoiStartTime requires selector, alias, or name.');
    if (operation.selector !== undefined) validateSelector(operation.selector, `${path}.selector`, errors);
    if (operation.customizeStartTime !== undefined && operation.customizeStartTime !== null && operation.customizeStartTime !== '' && !isValidStartTimeValue(operation.customizeStartTime)) {
      pushError(errors, `${path}.customizeStartTime`, '`customizeStartTime` must be seconds since midnight (integer or numeric string) or "HH:MM".');
    }
  }

  if (operation.type === 'postNote') {
    const hasTarget = operation.selector !== undefined || operation.alias !== undefined || operation.name !== undefined;
    if (!hasTarget) pushError(errors, path, 'postNote requires selector, alias, or name.');
    if (!operation.textNote && !operation.copyFrom) pushError(errors, path, 'postNote requires textNote or copyFrom.');
    if (operation.selector !== undefined) validateSelector(operation.selector, `${path}.selector`, errors);
    if (operation.copyFrom !== undefined) validateSelector(operation.copyFrom, `${path}.copyFrom`, errors);
  }

  if (operation.type === 'rebuildDaySegmentInOrder') {
    if (operation.verifyMode !== undefined && !['tail', 'exact'].includes(operation.verifyMode)) pushError(errors, `${path}.verifyMode`, '`verifyMode` must be `tail` or `exact`.');
    if (!Array.isArray(operation.items) || operation.items.length === 0) {
      pushError(errors, `${path}.items`, '`items` must be a non-empty array.');
    } else {
      operation.items.forEach((item, itemIndex) => {
        const itemPath = `${path}.items[${itemIndex}]`;
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          pushError(errors, itemPath, 'Rebuild item must be an object.');
          return;
        }
        if (!item.name) pushError(errors, `${itemPath}.name`, 'Rebuild item requires a name.');
        if (item.selector !== undefined) validateSelector(item.selector, `${itemPath}.selector`, errors);
        if (item.fallbackPoi !== undefined) validatePoiPayload(item.fallbackPoi, `${itemPath}.fallbackPoi`, errors);
        if (item.required !== false && item.selector === undefined && item.fallbackPoi === undefined) {
          pushError(errors, itemPath, 'Rebuild item should have a selector or fallbackPoi.');
        }
      });
    }
  }
}

function validateMutationPlan(plan) {
  const errors = [];
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
    pushError(errors, 'plan', 'Plan must be an object.');
    return { ok: false, errors };
  }

  for (const key of Object.keys(plan)) {
    if (!ALLOWED_TOP_LEVEL_FIELDS.has(key) && !String(key).startsWith('__')) {
      pushError(errors, key, 'Unknown top-level plan field.');
    }
  }

  if (!plan.tripId || typeof plan.tripId !== 'string') pushError(errors, 'tripId', 'tripId is required and must be a string.');
  if (!Array.isArray(plan.operations) || plan.operations.length === 0) pushError(errors, 'operations', 'operations must be a non-empty array.');
  if (Array.isArray(plan.operations)) plan.operations.forEach((operation, index) => validateOperation(operation, index, errors));

  return { ok: errors.length === 0, errors };
}

module.exports = {
  validateMutationPlan,
  validateSelector,
};

