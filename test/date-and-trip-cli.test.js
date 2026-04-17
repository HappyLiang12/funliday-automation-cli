const test = require('node:test');
const assert = require('node:assert/strict');
const { formatTripDateForApi } = require('../src/api/client');
const { mergeCreatePayload, mergeUpdatePayload } = require('../src/cli/trip');

test('formatTripDateForApi normalizes common formats', () => {
  assert.equal(formatTripDateForApi('2026-08-15'), '2026/08/15');
  assert.equal(formatTripDateForApi('20260815'), '2026/08/15');
  assert.equal(formatTripDateForApi('2026/08/15'), '2026/08/15');
});

test('mergeCreatePayload resolves create fields', () => {
  const result = mergeCreatePayload(
    { name: '', startDate: '', endDate: '', tripType: '', cityIds: ['123'] },
    { name: 'Demo', dateStart: '2026-08-15', dateEnd: '2026-08-16', tripType: 'friends' },
  );
  assert.equal(result.name, 'Demo');
  assert.deepEqual(result.userCities, ['123']);
  assert.equal(result.dateStart, '2026/08/15');
  assert.equal(result.tripType, '3');
});

test('mergeUpdatePayload fills omitted values from current summary', () => {
  const result = mergeUpdatePayload(
    { tripId: 'trip-1', name: '', startDate: '', endDate: '', tripType: '', cityIds: [] },
    {},
    { name: 'Current Name', dateStart: '2026/08/15', dateEnd: '2026/08/16', tripType: 3 },
  );
  assert.equal(result.tripId, 'trip-1');
  assert.equal(result.name, 'Current Name');
  assert.equal(result.tripType, '3');
});

