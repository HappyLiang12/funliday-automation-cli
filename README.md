# funliday-automation-cli

Unofficial Apache-2.0 licensed CLI and library for automating Funliday workflows through a logged-in browser session and JSON mutation plans.

- GitHub: `https://github.com/HappyLiang12/funliday-automation-cli`

> This project is **unofficial** and is **not affiliated with, endorsed by, or maintained by Funliday**.
> Users are responsible for ensuring their use of this tool complies with Funliday's Terms of Service and all applicable laws.
> This repository contains **community-maintained tooling only**; it does not grant any rights to Funliday services, APIs, branding, or backend infrastructure.

## What this package is

- a reusable API layer for common Funliday operations
- a mutation-plan runner for repeatable itinerary changes
- a selector DSL for targeting POIs safely
- CLI entry points designed for both humans and LLM/agent automation

## Who it is for

- engineers who want repeatable Funliday automation
- agent/LLM workflows that need a stable CLI surface
- advanced users who already understand browser-session based auth

If you are an AI agent, also read `SKILL.md` — it has a condensed install + usage cheatsheet.

## Install

```bash
git clone https://github.com/HappyLiang12/funliday-automation-cli.git
cd funliday-automation-cli
npm install
```

## Auth — quick start

The default and recommended mode for **local interactive use** is **browser-session**: the CLI attaches to a running Chrome instance over CDP and reuses your logged-in session.

1. Close all running Chrome windows.
2. Launch Chrome with CDP enabled and a dedicated profile:
   ```bash
   # macOS
   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
     --remote-debugging-port=9333 \
     --user-data-dir="$HOME/chrome-funliday" \
     https://www.funliday.com
   ```
   (See `docs/auth_models.md` for Windows / Linux equivalents.)
3. Log in to Funliday in that Chrome window once.
4. Verify CDP is reachable: `curl http://127.0.0.1:9333/json/version`
5. Run any CLI command.

For **sandboxed agents** (OpenClaw, Hermes, etc.) and **CI runners** that have no browser:

```bash
# On a developer machine that has Chrome (one-time, repeat on expiry):
npx funliday-auth export --output ./funliday-auth.json

# Verify:
npx funliday-auth check --auth-file ./funliday-auth.json --trip-id <some-trip-id>

# Ship funliday-auth.json into the sandbox as a secret, then:
npx funliday-trip get --trip-id <id> --auth-file ./funliday-auth.json --summary --pois
```

The full split-stage flow, expiry detection, and threat model are in **`docs/agent_sandbox_setup.md`**.

## Quick start

### Validate a mutation plan
```bash
npx funliday-plan-validate ./examples/mutation-plans/read-trip-verify.plan.json
# Valid plan: .../read-trip-verify.plan.json → ./artifacts/...validation.json
```

### Read a trip (slim summary + POI list)
```bash
npx funliday-trip get --trip-id <tripId> --summary --pois
# OK: <name> (<dateStart>–<dateEnd>, type 3) · 9 POIs → ./artifacts/active/funliday_trip_cli_get_output.json
```

Drop `--summary` to also include the raw `container` payload; drop `--pois` to skip the per-POI list.

### List your trips / find a city id
```bash
npx funliday-trip list --auth-file ./funliday-auth.json
# OK: 9 trips → ./artifacts/active/funliday_trip_cli_list_output.json

npx funliday-city search 沖繩
# 23120225 沖繩縣, 日本 (lat 26.213854, lng 127.6922209)
# OK: city "沖繩" → 2 results → ./artifacts/active/funliday_city_search_output.json
```
`funliday-trip list` returns each trip's `tripId` / `name` / `dateStart` / `dateEnd` (owned + shared trips, newest first) — the id to use with `funliday-trip get`. `funliday-city search` resolves the `cityId` needed by `funliday-trip create --city-id` (works anonymously; session headers are used when `--auth-file` is provided).

### Dry-run a plan offline (no auth, no network)
```bash
# 1. Save a snapshot once
npx funliday-api getPoisOfTrip '{"tripId":"<tripId>"}' --output snapshot.json

# 2. Iterate on plans without hitting the network
npx funliday-mutate run plan.json --dry-run --trip-snapshot snapshot.json
# OK [DRY-RUN(offline)]: 6/6 operations → ./artifacts/...output.json
```

### Run a mutation plan live
```bash
npx funliday-mutate run plan.json
# OK [LIVE]: 6/6 operations → ./artifacts/...output.json
```

### Search Poibank
```bash
npx funliday-poibank "上海 蟹粉" --output ./artifacts/poibank.json
# OK: poibank "上海 蟹粉" → 10 results → ./artifacts/poibank.json
```
In `--auth-file` mode the auth file must include the poibank token (`funliday-auth export --include-tokens`).

### Call a raw API endpoint
```bash
npx funliday-api getPoisOfTrip '{"tripId":"<tripId>"}'
# OK: api getPoisOfTrip (status=200) [auto: tripId -> parseTripObjectId] → ./artifacts/active/...
```
The CLI auto-rewrites `tripId → parseTripObjectId` for known trip-targeting endpoints. See `docs/public_api.md` for the full body-shape table.

## Public CLI commands

- `funliday` — combined dispatcher
- `funliday-auth` — export auth.json for sandboxed/CI use; check current auth
- `funliday-trip` — list / get / create / update trips
- `funliday-city` — search Funliday cities (id + name lookup for trip create)
- `funliday-mutate` — run / validate mutation plans
- `funliday-plan-validate` — alias for `funliday-mutate validate`
- `funliday-api` — raw POST to a named Funliday endpoint
- `funliday-poibank` — POI bank search

### Global flags (every command)
- `--quiet`, `-q` — suppress the one-line success summary
- `--debug` — print full stack traces on error (otherwise a single `Error [CODE]: <message>` line)
- `--endpoint <url>` — override CDP endpoint (default `http://127.0.0.1:9333`)
- `--output <file>` — override the artifact path
- `--auth-file <file>` / `--env-auth` — explicit auth instead of CDP

## Output and exit codes

- Every successful command prints **one line** to stdout summarizing what happened, plus the path to the JSON artifact. Use `--quiet` for purely machine-readable runs.
- Errors print a single `Error [CODE]: <message>` line to stderr (plus a remediation hint when one is known) and exit with code `1`. Use `--debug` to see the full stack.
- Mutating commands always write a structured JSON artifact even when they fail; `ok: false` and `error` fields are populated.

## Docs

- `docs/auth_models.md` — browser-session setup, troubleshooting, env-var reference
- `docs/agent_sandbox_setup.md` — **split-stage flow for sandboxed agents (OpenClaw, Hermes) and CI runners**
- `docs/public_api.md` — library exports + per-endpoint body shapes for `funliday-api`
- `docs/dry_run_limitations.md` — online vs offline dry-run, snapshot format
- `docs/plan_schema.md` — mutation plan schema
- `docs/selector_dsl.md` — POI selector DSL
- `SKILL.md` — agent cheatsheet (install + common flows)

## Stable vs experimental

### Stable
- plan validation
- selector matching
- trip metadata CLI structure (`summary`, `pois[]` slim form)
- browser-session auth extraction pattern
- error code surface (`CDP_UNREACHABLE`, `NOT_LOGGED_IN`, `AUTH_REQUIRED`, `FUNLIDAY_API_ERROR`)

### Experimental
- private / undocumented API assumptions
- raw API endpoints that may change without notice
- live mutation behavior against Funliday production accounts

## Safety notes

- do not commit cookies, tokens, signed URLs, or generated artifacts (the `artifacts/` directory is gitignored)
- use sanitized demo payloads only in public examples
- prefer `--trip-snapshot` offline dry-run, then online dry-run, then live
- prefer a throwaway/demo account or a non-critical trip when testing new live mutations

## Development

```bash
npm test                 # node:test unit tests
npm run validate:examples
npm run smoke:help
```

## License

Apache-2.0. See `LICENSE`.
