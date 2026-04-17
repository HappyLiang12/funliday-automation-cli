# funliday-automation-cli

Unofficial Apache-2.0 licensed CLI and library for automating Funliday workflows through a logged-in browser session and JSON mutation plans.

- GitHub: `https://github.com/HappyLiang12/funliday-automation-cli`

> This project is **unofficial** and is **not affiliated with, endorsed by, or maintained by Funliday**.
> Users are responsible for ensuring their use of this tool complies with Funliday's Terms of Service and all applicable laws.
> This repository contains **community-maintained tooling only**; it does not grant any rights to Funliday services, APIs, branding, or backend infrastructure.

## What this package is

This package provides:

- a reusable API layer for common Funliday operations
- a mutation-plan runner for repeatable itinerary changes
- a selector DSL for targeting POIs safely
- CLI entry points designed for both humans and LLM/agent automation

## Who it is for

- engineers who want repeatable Funliday automation
- agent/LLM workflows that need a stable CLI surface
- advanced users who already understand browser-session based auth

## Install

Clone the repository first, then install dependencies:

```bash
git clone https://github.com/HappyLiang12/funliday-automation-cli.git
cd funliday-automation-cli
npm install
```

## Auth model

This package currently supports two practical auth paths:

1. **browser-session mode**
   - connect to an already logged-in Chromium/Chrome session through CDP
2. **explicit auth mode**
   - pass an auth JSON file or use environment variables

Default browser-session endpoint:

- `http://127.0.0.1:9333`

Override with:

- `FUNLIDAY_CDP_ENDPOINT`
- `--endpoint <url>`

## Quick start

### Validate a mutation plan

```bash
npx funliday-plan-validate ./examples/mutation-plans/read-trip-verify.plan.json
```

### Run a mutation plan

```bash
npx funliday-mutate run ./examples/mutation-plans/read-trip-verify.plan.json
```

### Read a trip container

```bash
npx funliday-trip get --trip-id demo_trip_id --auth-file ./examples/auth.demo.json
```

### Search Poibank

```bash
npx funliday-poibank "demo keyword" --auth-file ./examples/auth.demo.json
```

## Public CLI commands

- `funliday`
- `funliday-trip`
- `funliday-mutate`
- `funliday-plan-validate`
- `funliday-api`
- `funliday-poibank`

See:

- `docs/public_api.md`
- `docs/auth_models.md`
- `docs/selector_dsl.md`
- `docs/plan_schema.md`
- `docs/dry_run_limitations.md`

## Stable vs experimental

### Stable-ish
- plan validation
- selector matching
- trip metadata CLI structure
- browser-session auth extraction pattern

### Experimental
- private / undocumented API assumptions
- raw API endpoints that may change without notice
- live mutation behavior against Funliday production accounts

## Safety notes

- do not commit cookies, tokens, signed URLs, or generated artifacts
- use sanitized demo payloads only in public examples
- prefer validation first, then dry-run or live execution
- prefer a throwaway/demo account or a non-critical trip when testing new live mutations

## Repository status

- current release stage: **experimental but functional**
- good fit for: local power users, engineers, and agent workflows
- not yet optimized for: guaranteed long-term API stability or official Funliday support

## Development

```bash
npm test
npm run validate:examples
npm run smoke:help
```

## License

Apache-2.0. See `LICENSE`.


