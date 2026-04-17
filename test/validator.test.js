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

