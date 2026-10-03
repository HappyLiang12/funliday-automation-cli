# Public API

## Library entry points

Main package export:

- `require('funliday-automation-cli')`

Direct subpath exports:

- `funliday-automation-cli/api`
- `funliday-automation-cli/browser-session`
- `funliday-automation-cli/env-auth`
- `funliday-automation-cli/mutation-runner`
- `funliday-automation-cli/plan-validator`
- `funliday-automation-cli/selector`

## Core functions

### API layer
- `createTrip`
- `getTripContainer` — returns `{ tripId, container, summary }` (no `response` duplicate as of v0.2)
- `updateTrip`
- `getTrip` — returns the POI list under `results`
- `deletePois`
- `addCustomPoi`
- `updatePoiStartTime`
- `getTextNote`
- `postTextNote`
- `searchPoibank`

### Auth layer
- `ensureFunlidaySessionPage` — throws `FunlidayCliError('CDP_UNREACHABLE' | 'CDP_CONNECT_FAILED')` on failure
- `extractFunlidayAuth` — throws `FunlidayCliError('NOT_LOGGED_IN')` if no session is found
- `readAuthFromEnv`
- `readAuthFromFile`

### Plan layer
- `validateMutationPlan`
- `runMutationPlan` — accepts `plan.tripSnapshot` for offline dry-run
- `findPois`
- `resolveSinglePoi`

## `funliday-api` body shapes

The CLI is a thin pass-through to the Funliday private API. **Trip-targeting endpoints expect `parseTripObjectId`, not `tripId`.** The CLI will silently rewrite `tripId → parseTripObjectId` for the endpoints listed below; for other endpoints, you must use the exact field name the server expects.

| `apiName` | Required body fields | Notes |
|---|---|---|
| `getPoisOfTrip` | `parseTripObjectId`, `deviceId` | `deviceId` auto-injected from auth. |
| `deletePois` | `parseTripObjectId`, `idArray`, `revision`, `deviceId` | `revision` from a prior `getPoisOfTrip`. |
| `addPoi` | `parseTripObjectId`, `daySequence`, `revision`, `name`, `address`, `location`, `stayTime`, `transportationType`, `addToCollections`, `dataSource`, `infoForPoiBank` | Use the `addCustomPoi` library helper or `funliday-mutate` instead — building this body by hand is fragile. |
| `updatePoiStartTime` | `parseTripObjectId`, `id` (poiId), `revision`, `customizeStartTime`, `stayTime` | |
| `getTextNote` | `parseTripObjectId`, `poiId` | |
| `postTextNote` | `parseTripObjectId`, `poiId`, `text` | Optional `textNoteObjectId` to update an existing note. |

If a call returns `HTTP 200 / "status":"000" / "message":"ErrorCodeUnknown"`, the most likely cause is a missing or misnamed body field. Run with `--debug` to see the request/response trace.

## `funliday-trip get --pois` slim POI shape

Each entry in `result.pois[]` uses the stable slim form below:

| Field | Description |
|---|---|
| `id` | POI id (`_id` upstream). |
| `name` | POI name. |
| `daySequence` | Day number (number). |
| `seq` | `poiSequenceIndex`. |
| `startTime` | Raw upstream `startTime` (4-digit HHMM, e.g. `"1100"` / `"840"`); can be stale after `updatePoiStartTime`. |
| `customizeStartTime` | Raw upstream `customizeStartTime` (seconds since midnight) or `null`. |
| `effectiveStartTime` | `"HH:MM"` view of when the POI starts: from `customizeStartTime` (seconds) when present/valid, else decoded from `startTime` (HHMM), else `null`. Use this — `startTime` is NOT recomputed by `updatePoiStartTime`. |
| `stayTime` | Stay duration in seconds (string) or `null`. |
| `address` | Address string (may be empty). |
| `location` | `{ lat, lng }` or `null` when the upstream POI has no location. |
| `hasNote` | `true` when a text note exists. |

## Safe read-only workflows

Safest operations to use first:

- `funliday-plan-validate plan.json`
- `funliday-trip get --trip-id <id> --summary --pois`
- `funliday-api getPoisOfTrip '{"tripId":"..."}'` (with auto-rewrite)
- selector tests against fixture data

## Output stability

| Output | Stable? |
|---|---|
| `summary` field shape on `funliday-trip get` | Yes |
| `pois[]` field shape on `funliday-trip get --pois` | Yes (slim form: `id, name, daySequence, seq, startTime, customizeStartTime, effectiveStartTime, stayTime, address, location, hasNote`) |
| `container` field (raw upstream payload) | No — passes through whatever Funliday returns |
| `executionReviewSummary` | Internal; do not parse in agents |
