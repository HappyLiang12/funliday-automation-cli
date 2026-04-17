const test = require('node:test');
const assert = require('node:assert/strict');
const fixture = require('./fixtures/trip.snapshot.json');
const { runMutationPlan } = require('../src/plan/mutation-runner');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test('dry-run simulates alias-based follow-up operations', async () => {
  const result = await runMutationPlan({
    plan: {
      version: 1,
      description: 'dry-run alias simulation',
      tripId: 'demo_trip_id',
      operations: [
        { type: 'addCustomPoi', alias: 'lunch', daySequence: 1, poi: { name: 'Demo Lunch', address: 'Demo Street 3', location: { lat: 5.5, lng: 6.6 }, stayTime: '1800' } },
        { type: 'updatePoiStartTime', selector: { alias: 'lunch' }, customizeStartTime: '45000', stayTime: '1800' },
        { type: 'postNote', selector: { alias: 'lunch' }, textNote: 'Lunch note' },
        { type: 'assertDayOrder', daySequence: 1, mode: 'exact', expectedNames: ['Demo Breakfast', 'Demo Museum', 'Demo Lunch'] }
      ]
    },
    dryRun: true,
    auth: { cookie: 'demo', authorization: 'Bearer demo', deviceId: 'demo-device', language: 'zh_tw' },
    adapters: {
      getTrip: async () => clone(fixture),
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.dryRun, true);
  assert.equal(result.finalTrip.pois.length, 3);
  assert.ok(result.aliases.lunch);
  const lunch = result.finalTrip.pois.find((poi) => poi.name === 'Demo Lunch');
  assert.equal(lunch.customizeStartTime, '45000');
  assert.equal(lunch.noteId.startsWith('dryrun-note-'), true);
});

