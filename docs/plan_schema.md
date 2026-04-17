# Mutation Plan Schema

The JSON schema is available at:

- `schemas/mutation-plan.schema.json`

Top-level fields:

- `version`
- `description`
- `tripId`
- `endpoint` (optional)
- `outputPath` (optional)
- `operations`

Supported operations:

- `readTrip`
- `assertDayOrder`
- `deletePois`
- `addCustomPoi`
- `updatePoiStartTime`
- `postNote`
- `rebuildDaySegmentInOrder`

Use `funliday-plan-validate` before live execution.

