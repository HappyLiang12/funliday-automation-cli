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
- `getTripContainer`
- `updateTrip`
- `getTrip`
- `deletePois`
- `addCustomPoi`
- `updatePoiStartTime`
- `getTextNote`
- `postTextNote`
- `searchPoibank`

### Auth layer
- `ensureFunlidaySessionPage`
- `extractFunlidayAuth`
- `readAuthFromEnv`
- `readAuthFromFile`

### Plan layer
- `validateMutationPlan`
- `runMutationPlan`
- `findPois`
- `resolveSinglePoi`

## Safe read-only workflows

Safest operations to use first:

- `funliday-plan-validate`
- `funliday-trip get`
- `funliday-api getPoisOfTrip ...`
- selector tests against fixture data

