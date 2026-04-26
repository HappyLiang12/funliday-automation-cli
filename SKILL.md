# SKILL.md — Agent cheatsheet for `funliday-automation-cli`

This file is for AI agents picking up this repo and trying to *use* it (not modify it). Read this first; it answers "how do I run anything against a real trip?" without re-deriving from the source.

## TL;DR install

```bash
git clone https://github.com/HappyLiang12/funliday-automation-cli.git
cd funliday-automation-cli
npm install   # installs Playwright (chromium driver only, ~80 MB)
```

Node ≥ 20 required.

## How auth actually works

Two paths. **Pick one** before doing anything else.

### Path A — browser-session (interactive, default)

The CLI attaches to a running Chrome over CDP. **You** are responsible for having that Chrome up and logged in.

```bash
# 1. close ALL Chrome windows first
# 2. launch Chrome with a dedicated profile + CDP port
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9333 \
  --user-data-dir="$HOME/chrome-funliday" \
  https://www.funliday.com
# 3. log in once in that window
# 4. verify
curl -s http://127.0.0.1:9333/json/version   # should return JSON
```

If `--remote-debugging-port` "doesn't work", it's almost always because Chrome was already running. There is no error — Chrome silently re-uses the existing session and skips opening the CDP port.

### Path B — explicit auth (CI / agent automation)

```bash
npx funliday-trip get --trip-id <id> --auth-file ./auth.json
# or
FUNLIDAY_COOKIE=... FUNLIDAY_AUTHORIZATION=... \
  npx funliday-trip get --trip-id <id> --env-auth
```

`auth.json` shape: `{ cookie, authorization, memberId, accessToken, deviceId, language, poibankToken, webToken }`. See `docs/auth_models.md` for which subset is required.

## Output contract (every command)

- **Success** → one line on stdout, exit `0`:
  ```
  OK: <human description> → <artifact path>
  ```
- **Failure** → one line on stderr, exit `1`:
  ```
  Error [CODE]: <message>
  Hint: <remediation if known>
  ```
- A structured JSON artifact is always written. Parse that for machine-readable details.

Suppress the success line with `--quiet`. Get full stack traces with `--debug`.

## The four flows you actually need

### 1. Read a trip

```bash
npx funliday-trip get --trip-id <tripId> --summary --pois
```
Artifact contains `{ tripId, summary: { name, dateStart, dateEnd, tripType, ... }, pois: [{ id, name, daySequence, seq, startTime, customizeStartTime, stayTime, address, hasNote }] }`.

Drop `--summary` to also get the raw `container`. `--pois` adds the slim POI list.

### 2. Snapshot a trip for offline work

```bash
npx funliday-api getPoisOfTrip '{"tripId":"<tripId>"}' --output snapshot.json
```
The `tripId → parseTripObjectId` rewrite is automatic.

### 3. Dry-run a mutation plan offline (no network)

```bash
npx funliday-mutate run plan.json --dry-run --trip-snapshot snapshot.json
```
Use this loop while iterating on a plan. No CDP, no network, no auth.

### 4. Run a mutation plan live

```bash
npx funliday-plan-validate plan.json     # cheap structural check
npx funliday-mutate run plan.json --dry-run --trip-snapshot snapshot.json   # offline simulate
npx funliday-mutate run plan.json --dry-run                                  # online simulate
npx funliday-mutate run plan.json                                            # live mutate
```

## Mutation plan template

Everything is JSON. Operations execute in array order.

```json
{
  "version": 1,
  "tripId": "<tripId>",
  "operations": [
    { "type": "readTrip", "saveAs": "before" },
    {
      "type": "addCustomPoi",
      "alias": "myNewPoi",
      "daySequence": 1,
      "poi": {
        "name": "POI name",
        "address": "...",
        "location": { "lat": 31.24, "lng": 121.49 },
        "stayTime": "1800"
      }
    },
    {
      "type": "updatePoiStartTime",
      "selector": { "alias": "myNewPoi" },
      "customizeStartTime": "2000",
      "stayTime": "1800"
    },
    {
      "type": "postNote",
      "selector": { "alias": "myNewPoi" },
      "textNote": "Free-text note attached to the POI."
    },
    {
      "type": "deletePois",
      "selector": { "nameContains": "old name" },
      "required": false
    }
  ]
}
```

Operation types: `readTrip`, `assertDayOrder`, `deletePois`, `addCustomPoi`, `updatePoiStartTime`, `postNote`, `rebuildDaySegmentInOrder`.

Selector grammar: `alias`, `id`/`idIn`, `name`/`nameContains`/`nameStartsWith`/`nameEndsWith`/`nameRegex`, `daySequence`/`daySequenceIn`, `seq`/`seqGte`/`seqLte`, `startTime`/`startTimeGte`/`startTimeLte`, `stayTime`/`stayTimeGte`/`stayTimeLte`, `hasNote`. Compose with `any[]` / `all[]` / `not`. Cardinality: `first`, `last`, `nth`, `limit`. Full doc: `docs/selector_dsl.md`.

## Field-name gotchas

| Symptom | Cause | Fix |
|---|---|---|
| `Error [FUNLIDAY_API_ERROR]: getPoisOfTrip failed: HTTP 200 / 000 / ErrorCodeUnknown` | Body uses `tripId` instead of `parseTripObjectId` | Use `funliday-api` (auto-rewrites) or pass `parseTripObjectId` explicitly. |
| `Error [CDP_UNREACHABLE]` | Chrome not running with CDP port | See "Path A" above. |
| `Error [NOT_LOGGED_IN]` | Connected to Chrome but no Funliday session in that profile | Log in to Funliday in the Chrome window the CLI attached to. |
| `Error [AUTH_FILE_NOT_FOUND]` | `--auth-file` path is wrong | Resolve relative to the *current working directory*, not the repo root. |
| `customizeStartTime` ignored on UI | Funliday auto-recomputes `startTime` based on stay times. `customizeStartTime` is the user override; the UI shows whichever applies. | Set `customizeStartTime` only when you want to pin a specific time. |

## Safety

- The `artifacts/` directory is gitignored. Keep it that way.
- Live mutations are non-reversible; prefer `--trip-snapshot` dry-run for plan development.
- Never commit anything from `artifacts/active/` — it contains tokens.

## Where to dig deeper

- `docs/auth_models.md` — auth modes + troubleshooting matrix
- `docs/public_api.md` — library exports + per-endpoint body shapes
- `docs/dry_run_limitations.md` — what dry-run does and does not simulate
- `docs/plan_schema.md` / `docs/selector_dsl.md` — plan/selector grammar
- `examples/mutation-plans/` — runnable example plans
- `test/fixtures/trip.snapshot.json` — minimal trip shape for unit tests
