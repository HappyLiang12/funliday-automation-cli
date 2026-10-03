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

## Time fields

`customizeStartTime` (on `updatePoiStartTime`, inside `addCustomPoi.poi`, and inside `rebuildDaySegmentInOrder.items[].fallbackPoi`) accepts either:

- seconds since midnight — the API's canonical unit, e.g. `"39600"` (11:00) or integer `39600`; or
- `"HH:MM"` / `"H:MM"`, e.g. `"11:00"` / `"8:30"`, which the runner converts to seconds before calling the API.

Plain digit values are always treated as seconds: `"1100"` means 1100 seconds (00:18:20), NOT 11:00. Do not pass HHMM.

Notes:

- `addCustomPoi` applies `poi.customizeStartTime` (if present) right after the successful add.
- `rebuildDaySegmentInOrder` recreates items and re-applies each item's start time: the live POI's `customizeStartTime` first, else `fallbackPoi.customizeStartTime`; when neither exists the start-time update is skipped. `fallbackPoi` may therefore include `customizeStartTime`.
- After `updatePoiStartTime`, the derived `startTime` field returned by the API is NOT recomputed and can be stale; `customizeStartTime` (seconds) is the effective value the UI displays.

