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

Two paths. **Pick one** based on whether your runtime can run a desktop browser.

| You are running… | Use |
|---|---|
| Locally on a developer machine with Chrome | Path A (browser-session) |
| In a sandbox (OpenClaw, Hermes), CI runner, or any headless env | Path B (explicit auth) |

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

### Path B — explicit auth (sandboxed agents, CI)

This path is split across two stages, because a sandbox cannot run a browser:

**Stage 1 (one-time, on a machine with Chrome):**
```bash
# After steps 1–3 of Path A above:
npx funliday-auth export --output ./funliday-auth.json
# OK [auth export]: wrote ./funliday-auth.json (fields: authorization, deviceId, language, cookie)

# Verify end-to-end against a known trip:
npx funliday-auth check --auth-file ./funliday-auth.json --trip-id <id>
# OK [auth check]: member=... deviceId=present trip=... pois=9 → ...
```

**Stage 2 (in the sandbox):**
```bash
# Mount funliday-auth.json as a secret, then:
npx funliday-trip get --trip-id <id> --auth-file ./funliday-auth.json --summary --pois --quiet
npx funliday-mutate run plan.json --auth-file ./funliday-auth.json --quiet

# Or via env vars (--env-auth):
export FUNLIDAY_AUTHORIZATION="$(jq -r .authorization < funliday-auth.json)"
export FUNLIDAY_COOKIE="$(jq -r .cookie         < funliday-auth.json)"
export FUNLIDAY_DEVICE_ID="$(jq -r .deviceId    < funliday-auth.json)"
npx funliday-trip get --trip-id <id> --env-auth
```

**When auth expires** the CLI exits 1 with `Error [AUTH_EXPIRED]:` on stderr. Detect that prefix and request a fresh export from Stage 1. Detection rules and a sample bash check loop are in `docs/agent_sandbox_setup.md`.

The sandbox needs **no Chrome, no Playwright at runtime, no CDP port** — only outbound HTTPS to `funlidays.com` / `funliday.com` / `api.poibank.com`.

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

### 0. Discover trip ids and city ids

```bash
npx funliday-trip list --auth-file ./funliday-auth.json
# OK: 9 trips → ./artifacts/active/funliday_trip_cli_list_output.json

npx funliday-city search 沖繩
# 23120225 沖繩縣, 日本 (lat 26.213854, lng 127.6922209)
# OK: city "沖繩" → 2 results → ./artifacts/active/funliday_city_search_output.json
```

`funliday-trip list` writes `{ trips: [{ tripId, name, dateStart, dateEnd, dayCount, shared }] }` (owned + shared, newest first — the same set the website shows on `/me/trips`). `funliday-city search <keyword>` matches city names/aliases (zh + en) and prints `<cityId> <name>[, <parent>][, <country>] (lat, lng)`; feed the `cityId` to `funliday-trip create --city-id`. City search needs no auth (session headers are forwarded when `--auth-file` / `--env-auth` is given).

### 1. Read a trip

```bash
npx funliday-trip get --trip-id <tripId> --summary --pois
```
Artifact contains `{ tripId, summary: { name, dateStart, dateEnd, tripType, ... }, pois: [{ id, name, daySequence, seq, startTime, customizeStartTime, effectiveStartTime, stayTime, address, location, hasNote }] }`.

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
        "stayTime": "1800",
        "customizeStartTime": "20:00"
      }
    },
    {
      "type": "updatePoiStartTime",
      "selector": { "alias": "myNewPoi" },
      "customizeStartTime": "20:00",
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

`customizeStartTime`: the API's canonical unit is **seconds since midnight** (`20:00` = `"72000"`). Plans may instead use `"HH:MM"` (e.g. `"20:00"`), which `funliday-mutate` converts to seconds before calling the API. Plain digit values are always treated as seconds — `"1100"` is NOT auto-converted from HHMM. `addCustomPoi` accepts `poi.customizeStartTime`; `rebuildDaySegmentInOrder` items may carry it via `fallbackPoi.customizeStartTime` for brand-new POIs.

Keep POI names unique per day where possible: selectors match by name (and the fallback path for detecting a just-added POI matches by name when the API response id is unavailable), so duplicate names can make plans ambiguous.

Operation types: `readTrip`, `assertDayOrder`, `deletePois`, `addCustomPoi`, `updatePoiStartTime`, `postNote`, `rebuildDaySegmentInOrder`.

Selector grammar: `alias`, `id`/`idIn`, `name`/`nameContains`/`nameStartsWith`/`nameEndsWith`/`nameRegex`, `daySequence`/`daySequenceIn`, `seq`/`seqGte`/`seqLte`, `startTime`/`startTimeGte`/`startTimeLte`, `stayTime`/`stayTimeGte`/`stayTimeLte`, `hasNote`. Compose with `any[]` / `all[]` / `not`. Cardinality: `first`, `last`, `nth`, `limit`. Full doc: `docs/selector_dsl.md`.

## Field-name gotchas

| Symptom | Cause | Fix |
|---|---|---|
| `Error [FUNLIDAY_API_ERROR]: getPoisOfTrip failed: HTTP 200 / 000 / ErrorCodeUnknown` | Body uses `tripId` instead of `parseTripObjectId` | Use `funliday-api` (auto-rewrites) or pass `parseTripObjectId` explicitly. |
| `Error [CDP_UNREACHABLE]` | Chrome not running with CDP port | See "Path A" above. |
| `Error [NOT_LOGGED_IN]` | Connected to Chrome but no Funliday session in that profile | Log in to Funliday in the Chrome window the CLI attached to. |
| `Error [AUTH_FILE_NOT_FOUND]` | `--auth-file` path is wrong | Resolve relative to the *current working directory*, not the repo root. |
| `Error [AUTH_EXPIRED]` | Funliday rejected the credentials (HTTP 401/403 or known error pattern) | Re-export auth from a logged-in browser: `funliday-auth export`. See `docs/agent_sandbox_setup.md` Stage 4. |
| Start time shows 00:18 (or another nonsense hour) on the site | `customizeStartTime` was sent as HHMM (`"1100"`) instead of seconds since midnight (`"39600"`) | Use seconds since midnight — that is the canonical API unit; `"HH:MM"` strings are also accepted and converted by `funliday-mutate`. |
| `startTime` looks stale in read-backs after `updatePoiStartTime` | The derived `startTime` field is NOT recomputed by `updatePoiStartTime`; the UI displays `customizeStartTime` when present | Read `customizeStartTime` (seconds) for the effective value; use `effectiveStartTime` ("HH:MM") from `funliday-trip get --pois`. |
| `Error [POIBANK_ACCESS_UPGRADE_REQUIRED]` | Web-session poibank tokens return placeholder rows (`"Please upgrade App"`) instead of real POI data | Real poibank search data is unavailable with this token; use trip-based endpoints. |

## Safety

- The `artifacts/` directory is gitignored. Keep it that way.
- Live mutations are non-reversible; prefer `--trip-snapshot` dry-run for plan development.
- Never commit anything from `artifacts/active/` — it contains tokens.

## Where to dig deeper

- `docs/auth_models.md` — auth modes + troubleshooting matrix
- `docs/agent_sandbox_setup.md` — **start here if you're a sandboxed agent (OpenClaw, Hermes)**: split-stage extract-then-consume flow, secret transport, expiry handling
- `docs/public_api.md` — library exports + per-endpoint body shapes
- `docs/dry_run_limitations.md` — what dry-run does and does not simulate
- `docs/plan_schema.md` / `docs/selector_dsl.md` — plan/selector grammar
- `examples/mutation-plans/` — runnable example plans
- `test/fixtures/trip.snapshot.json` — minimal trip shape for unit tests
