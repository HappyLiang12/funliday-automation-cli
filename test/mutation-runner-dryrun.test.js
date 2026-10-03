const test = require('node:test');
const assert = require('node:assert/strict');
const fixture = require('./fixtures/trip.snapshot.json');
const { runMutationPlan } = require('../src/plan/mutation-runner');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const DEMO_AUTH = { cookie: 'demo', authorization: 'Bearer demo', deviceId: 'demo-device', language: 'zh_tw' };

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

test('dry-run updatePoiStartTime accepts HH:MM and stores seconds', async () => {
  const result = await runMutationPlan({
    plan: {
      tripId: 'demo_trip_id',
      operations: [
        { type: 'updatePoiStartTime', selector: { name: 'Demo Museum' }, customizeStartTime: '11:00', stayTime: '5400' },
      ],
    },
    dryRun: true,
    auth: DEMO_AUTH,
    adapters: { getTrip: async () => clone(fixture) },
  });

  assert.equal(result.ok, true);
  assert.equal(result.operations[0].customizeStartTime, '39600');
  const museum = result.finalTrip.pois.find((poi) => poi.name === 'Demo Museum');
  assert.equal(museum.customizeStartTime, '39600');
});

test('dry-run addCustomPoi applies poi.customizeStartTime', async () => {
  const result = await runMutationPlan({
    plan: {
      tripId: 'demo_trip_id',
      operations: [
        {
          type: 'addCustomPoi',
          alias: 'dinner',
          daySequence: 1,
          poi: { name: 'Demo Dinner', address: 'Demo Street 9', location: { lat: 7.7, lng: 8.8 }, stayTime: '1800', customizeStartTime: '8:30' },
        },
      ],
    },
    dryRun: true,
    auth: DEMO_AUTH,
    adapters: { getTrip: async () => clone(fixture) },
  });

  assert.equal(result.ok, true);
  assert.equal(result.aliases.dinner, result.operations[0].poi.id);
  assert.equal(result.operations[0].poi.customizeStartTime, '30600');
  const dinner = result.finalTrip.pois.find((poi) => poi.name === 'Demo Dinner');
  assert.equal(dinner.customizeStartTime, '30600');
  assert.equal(dinner.stayTime, '1800');
});

test('dry-run rebuild carries live customize times and applies fallbackPoi customizeStartTime', async () => {
  const result = await runMutationPlan({
    plan: {
      tripId: 'demo_trip_id',
      operations: [
        {
          type: 'rebuildDaySegmentInOrder',
          daySequence: 1,
          verifyMode: 'exact',
          force: true,
          items: [
            { selector: { name: 'Demo Breakfast' }, name: 'Demo Breakfast' },
            { selector: { name: 'Demo Museum' }, name: 'Demo Museum' },
            {
              name: 'Demo Dinner',
              required: false,
              fallbackPoi: {
                name: 'Demo Dinner',
                address: 'Demo Street 9',
                location: { lat: 7.7, lng: 8.8 },
                stayTime: '5400',
                customizeStartTime: '19:00',
              },
            },
          ],
        },
      ],
    },
    dryRun: true,
    auth: DEMO_AUTH,
    adapters: { getTrip: async () => clone(fixture) },
  });

  assert.equal(result.ok, true);
  const day1 = result.finalTrip.pois
    .filter((poi) => Number(poi.daySequence) === 1)
    .sort((a, b) => a.seq - b.seq);
  assert.deepEqual(day1.map((poi) => poi.name), ['Demo Breakfast', 'Demo Museum', 'Demo Dinner']);
  assert.equal(day1.find((poi) => poi.name === 'Demo Breakfast').customizeStartTime, '32400');
  assert.equal(day1.find((poi) => poi.name === 'Demo Museum').customizeStartTime, '39600');
  assert.equal(day1.find((poi) => poi.name === 'Demo Dinner').customizeStartTime, '68400');
});

test('dry-run rebuild skips updatePoiStartTime when no customize time exists', async () => {
  const snapshot = clone(fixture);
  snapshot.pois[0].customizeStartTime = null;

  const result = await runMutationPlan({
    plan: {
      tripId: 'demo_trip_id',
      operations: [
        {
          type: 'rebuildDaySegmentInOrder',
          daySequence: 1,
          verifyMode: 'exact',
          force: true,
          items: [
            { selector: { name: 'Demo Breakfast' }, name: 'Demo Breakfast' },
            { selector: { name: 'Demo Museum' }, name: 'Demo Museum' },
          ],
        },
      ],
    },
    dryRun: true,
    auth: DEMO_AUTH,
    adapters: { getTrip: async () => clone(snapshot) },
  });

  assert.equal(result.ok, true);
  const breakfast = result.finalTrip.pois.find((poi) => poi.name === 'Demo Breakfast');
  const museum = result.finalTrip.pois.find((poi) => poi.name === 'Demo Museum');
  // No customize time anywhere for Breakfast: the update call is skipped, so the
  // recreated POI keeps a null customizeStartTime (previously an empty "" was sent).
  assert.equal(breakfast.customizeStartTime, null);
  assert.equal(museum.customizeStartTime, '39600');
});

test('live addCustomPoi resolves the created POI by the addPoi response id', async () => {
  const liveTrip = clone(fixture);
  const updateCalls = [];

  const addPoiAdapter = async ({ poi, daySequence }) => {
    const makePoi = (id, seq) => ({
      _id: id,
      name: poi.name,
      daySequence: Number(daySequence),
      poiSequenceIndex: seq,
      startTime: null,
      customizeStartTime: null,
      stayTime: String(poi.stayTime),
      address: poi.address,
      location: clone(poi.location),
      textNote: null,
    });
    // A same-named record also arrives among the "new" POIs; name-only
    // detection would pick the first match, the response id must win.
    liveTrip.pois.push(makePoi('poi-decoy', 9998));
    liveTrip.pois.push(makePoi('poi-real', 9999));
    liveTrip.revision = String(Number(liveTrip.revision) + 1);
    return { status: '200', message: 'success', results: { poi: { _id: 'poi-real', name: poi.name }, revision: liveTrip.revision } };
  };

  const result = await runMutationPlan({
    plan: {
      tripId: 'demo_trip_id',
      operations: [
        {
          type: 'addCustomPoi',
          alias: 'dinner',
          daySequence: 1,
          poi: { name: 'Demo Dinner', address: 'Demo Street 9', location: { lat: 7.7, lng: 8.8 }, stayTime: '1800', customizeStartTime: '20:00' },
        },
      ],
    },
    dryRun: false,
    auth: DEMO_AUTH,
    adapters: {
      getTrip: async () => clone(liveTrip),
      addCustomPoi: addPoiAdapter,
      updatePoiStartTime: async (input) => {
        updateCalls.push(input);
        const target = liveTrip.pois.find((poi) => poi._id === input.poiId);
        target.customizeStartTime = String(input.customizeStartTime);
        target.stayTime = String(input.stayTime);
        liveTrip.revision = String(Number(liveTrip.revision) + 1);
        return { status: '200' };
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.aliases.dinner, 'poi-real');
  assert.equal(result.operations[0].poi.id, 'poi-real');
  assert.equal(updateCalls.length, 1);
  assert.equal(updateCalls[0].customizeStartTime, '72000');
  assert.equal(updateCalls[0].stayTime, '1800');
  const real = result.finalTrip.pois.find((poi) => poi.id === 'poi-real');
  assert.equal(real.customizeStartTime, '72000');
});

test('live addCustomPoi falls back to name detection and skips start-time update when absent', async () => {
  const liveTrip = clone(fixture);
  const updateCalls = [];

  const result = await runMutationPlan({
    plan: {
      tripId: 'demo_trip_id',
      operations: [
        { type: 'addCustomPoi', alias: 'coffee', daySequence: 1, poi: { name: 'Demo Coffee', address: 'Demo Street 4', location: { lat: 3.1, lng: 4.1 }, stayTime: '600' } },
      ],
    },
    dryRun: false,
    auth: DEMO_AUTH,
    adapters: {
      getTrip: async () => clone(liveTrip),
      addCustomPoi: async ({ poi, daySequence }) => {
        liveTrip.pois.push({
          _id: 'poi-coffee',
          name: poi.name,
          daySequence: Number(daySequence),
          poiSequenceIndex: 9999,
          startTime: null,
          customizeStartTime: null,
          stayTime: String(poi.stayTime),
          address: poi.address,
          location: clone(poi.location),
          textNote: null,
        });
        liveTrip.revision = String(Number(liveTrip.revision) + 1);
        return { status: '200', message: 'success' };
      },
      updatePoiStartTime: async (input) => {
        updateCalls.push(input);
        return { status: '200' };
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.aliases.coffee, 'poi-coffee');
  assert.equal(result.operations[0].poi.id, 'poi-coffee');
  assert.equal(updateCalls.length, 0);
});
