const test = require('node:test');
const assert = require('node:assert/strict');
const { slimPoi } = require('../src/cli/trip');

test('slimPoi maps location and effectiveStartTime from customizeStartTime (seconds)', () => {
  const result = slimPoi({
    _id: 'poi-1',
    name: 'Museum',
    daySequence: 1,
    poiSequenceIndex: 11,
    startTime: '1100',
    customizeStartTime: '39600',
    stayTime: '5400',
    address: 'Demo Street 2',
    location: { lat: 3.3, lng: 4.4 },
    textNote: null,
  });

  assert.deepEqual(result.location, { lat: 3.3, lng: 4.4 });
  assert.equal(result.effectiveStartTime, '11:00');
  assert.equal(result.customizeStartTime, '39600');
});

test('slimPoi derives effectiveStartTime from HHMM startTime when customization is absent', () => {
  const withFourDigits = slimPoi({ _id: 'poi-2', name: 'A', daySequence: 1, poiSequenceIndex: 10, startTime: '1100', customizeStartTime: null, stayTime: '600' });
  assert.equal(withFourDigits.effectiveStartTime, '11:00');

  const withThreeDigits = slimPoi({ _id: 'poi-3', name: 'B', daySequence: 1, poiSequenceIndex: 11, startTime: '840', customizeStartTime: null, stayTime: '600' });
  assert.equal(withThreeDigits.effectiveStartTime, '08:40');
});

test('slimPoi handles midnight, missing location, and missing times', () => {
  const midnight = slimPoi({ _id: 'poi-4', name: 'C', daySequence: 2, poiSequenceIndex: 10, startTime: '0900', customizeStartTime: 0, stayTime: '600', location: null });
  assert.equal(midnight.effectiveStartTime, '00:00');
  assert.equal(midnight.location, null);

  const empty = slimPoi({ _id: 'poi-5', name: 'D', daySequence: 2, poiSequenceIndex: 11 });
  assert.equal(empty.effectiveStartTime, null);
  assert.equal(empty.location, null);
  assert.equal(empty.address, '');
  assert.equal(empty.hasNote, false);
});

test('slimPoi ignores invalid customizeStartTime and falls back to startTime', () => {
  const invalid = slimPoi({ _id: 'poi-6', name: 'E', daySequence: 1, poiSequenceIndex: 12, startTime: '840', customizeStartTime: 'not-a-time', stayTime: '600' });
  assert.equal(invalid.effectiveStartTime, '08:40');
});
