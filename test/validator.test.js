const test = require('node:test');
const assert = require('node:assert/strict');
const { validateMutationPlan } = require('../src/plan/validator');

test('validateMutationPlan accepts a valid plan', () => {
  const result = validateMutationPlan({
    tripId: 'demo',
    operations: [
      { type: 'readTrip', saveAs: 'before' },
      { type: 'assertDayOrder', daySequence: 1, expectedNames: ['A'] },
    ],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test('validateMutationPlan rejects invalid selector usage', () => {
  const result = validateMutationPlan({
    tripId: 'demo',
    operations: [
      { type: 'deletePois', selector: { first: true, nth: 1 } },
    ],
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((item) => item.path.includes('selector')));
});

test('validateMutationPlan accepts HH:MM and seconds customizeStartTime', () => {
  const result = validateMutationPlan({
    tripId: 'demo',
    operations: [
      { type: 'updatePoiStartTime', selector: { name: 'A' }, customizeStartTime: '8:30' },
      { type: 'updatePoiStartTime', selector: { name: 'A' }, customizeStartTime: 39600 },
      { type: 'addCustomPoi', daySequence: 1, poi: { name: 'A', address: 'x', location: { lat: 1, lng: 2 }, stayTime: '1800', customizeStartTime: '20:00' } },
      {
        type: 'rebuildDaySegmentInOrder',
        daySequence: 1,
        items: [
          {
            name: 'B',
            required: false,
            fallbackPoi: { name: 'B', address: 'y', location: { lat: 3, lng: 4 }, stayTime: '600', customizeStartTime: '39600' },
          },
        ],
      },
    ],
  });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

test('validateMutationPlan rejects invalid customizeStartTime in operations and poi payloads', () => {
  const result = validateMutationPlan({
    tripId: 'demo',
    operations: [
      { type: 'updatePoiStartTime', selector: { name: 'A' }, customizeStartTime: '25:00' },
      { type: 'addCustomPoi', daySequence: 1, poi: { name: 'A', address: 'x', location: { lat: 1, lng: 2 }, stayTime: '1800', customizeStartTime: 'noon' } },
      {
        type: 'rebuildDaySegmentInOrder',
        daySequence: 1,
        items: [
          {
            name: 'B',
            required: false,
            fallbackPoi: { name: 'B', address: 'y', location: { lat: 3, lng: 4 }, stayTime: '600', customizeStartTime: '11:60' },
          },
        ],
      },
    ],
  });
  assert.equal(result.ok, false);
  const customizeErrors = result.errors.filter((item) => item.path.endsWith('customizeStartTime'));
  assert.equal(customizeErrors.length, 3);
});

