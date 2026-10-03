const test = require('node:test');
const assert = require('node:assert/strict');
const { isValidStartTimeValue, normalizeStartTimeToSeconds } = require('../src/plan/time');

test('normalizeStartTimeToSeconds converts HH:MM and H:MM to seconds since midnight', () => {
  assert.equal(normalizeStartTimeToSeconds('11:00'), '39600');
  assert.equal(normalizeStartTimeToSeconds('8:30'), '30600');
  assert.equal(normalizeStartTimeToSeconds('00:00'), '0');
  assert.equal(normalizeStartTimeToSeconds('23:59'), '86340');
});

test('normalizeStartTimeToSeconds passes numeric seconds through verbatim', () => {
  assert.equal(normalizeStartTimeToSeconds('39600'), '39600');
  assert.equal(normalizeStartTimeToSeconds(39600), '39600');
  assert.equal(normalizeStartTimeToSeconds(0), '0');
  // Plain 4-digit values are ambiguous and stay seconds (NOT converted from HHMM).
  assert.equal(normalizeStartTimeToSeconds('1100'), '1100');
});

test('normalizeStartTimeToSeconds rejects invalid values', () => {
  const invalid = ['', '  ', 'abc', 'noon', '11:5', '11:60', '25:00', '-30', -1, 1.5, null, undefined, {}, true];
  for (const value of invalid) {
    assert.throws(
      () => normalizeStartTimeToSeconds(value),
      (error) => error.code === 'INVALID_INPUT',
      `expected INVALID_INPUT for ${JSON.stringify(value)}`,
    );
  }
});

test('isValidStartTimeValue mirrors the normalizer without throwing', () => {
  assert.equal(isValidStartTimeValue('11:00'), true);
  assert.equal(isValidStartTimeValue('8:30'), true);
  assert.equal(isValidStartTimeValue('39600'), true);
  assert.equal(isValidStartTimeValue(39600), true);
  assert.equal(isValidStartTimeValue(0), true);
  assert.equal(isValidStartTimeValue('25:00'), false);
  assert.equal(isValidStartTimeValue('11:60'), false);
  assert.equal(isValidStartTimeValue('abc'), false);
  assert.equal(isValidStartTimeValue(-5), false);
  assert.equal(isValidStartTimeValue(1.5), false);
});
