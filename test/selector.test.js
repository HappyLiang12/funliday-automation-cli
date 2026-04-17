const test = require('node:test');
const assert = require('node:assert/strict');
const fixture = require('./fixtures/trip.snapshot.json');
const { findPois, resolveSinglePoi } = require('../src/plan/selector');

test('findPois supports leaf selectors and cardinality', () => {
  const state = { aliases: {} };
  const found = findPois(fixture, { daySequence: 1, first: true }, state);
  assert.equal(found.length, 1);
  assert.equal(found[0].name, 'Demo Breakfast');
});

test('resolveSinglePoi supports name selectors', () => {
  const state = { aliases: {} };
  const poi = resolveSinglePoi(fixture, { nameContains: 'Museum' }, state);
  assert.equal(poi._id, 'poi-2');
});

