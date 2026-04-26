# Dry-run behavior and limitations

## Two dry-run modes

### A. Online dry-run (default)

```bash
npx funliday-mutate run plan.json --dry-run
```

Still requires:
- Live CDP browser-session (or `--auth-file` / `--env-auth`)
- Network access to Funliday
- The trip to actually exist

The CLI fetches the real trip state once, then simulates every mutation operation against an in-memory virtual trip without calling any mutating endpoints.

### B. Offline dry-run (recommended for CI / plan dev)

```bash
npx funliday-mutate run plan.json --dry-run --trip-snapshot snapshot.json
```

`--trip-snapshot` accepts any file containing a trip-shaped object — for example, the output of:

```bash
npx funliday-api getPoisOfTrip '{"tripId":"<tripId>"}' --output snapshot.json
```

When `--trip-snapshot` is set:
- No CDP, no auth, no network calls.
- The plan is validated and applied against the snapshot's virtual trip.
- The output JSON shows the simulated final state.

The CLI auto-detects these snapshot shapes:
- `{ response: { results: { revision, totalCount, pois: [...] } } }` (raw `funliday-api getPoisOfTrip` output)
- `{ results: { ... } }`
- `{ revision, totalCount, pois: [...] }` (plain trip object)
- `{ trip: { pois: [...] } }`

You can also embed the snapshot directly in the plan with a top-level `tripSnapshot` field instead of using the flag.

## What dry-run is good for

- Validating plan structure
- Previewing operation sequencing
- Testing selector behavior against virtual state
- Exercising alias-based follow-up operations (the runner tracks synthetic IDs)

## What dry-run does not guarantee

Dry-run is not a guarantee that Funliday production behavior will match exactly. Possible differences:

- Server-side validation rules
- Auto-recomputed `startTime` after edits
- Hidden API side effects
- Undocumented endpoint behavior changes

## Recommended workflow

1. `funliday-plan-validate plan.json`
2. `funliday-mutate run plan.json --dry-run --trip-snapshot snapshot.json` (offline; iterate fast)
3. `funliday-mutate run plan.json --dry-run` (online; verify against real current state)
4. `funliday-mutate run plan.json` (live)
