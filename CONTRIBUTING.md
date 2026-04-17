# Contributing

Repository:

- `https://github.com/HappyLiang12/funliday-automation-cli`

## Project structure

- `src/api/` - Funliday and Poibank API helpers
- `src/auth/` - auth providers
- `src/plan/` - selector DSL, validation, mutation runner
- `src/cli/` - CLI command implementations
- `bin/` - public executable entry points
- `examples/` - sanitized example payloads and plans
- `schemas/` - JSON schemas
- `test/` - unit and fixture-based tests

## Development commands

```bash
npm test
npm run validate:examples
npm run smoke:help
```

## Contribution rules

- keep public examples sanitized
- do not commit artifacts or secrets
- prefer small reusable modules over trip-specific scripts
- document any new mutation operation or selector feature
- add tests for all non-trivial behavior changes

## Before opening a PR

- run `npm test`
- run `npm run validate:examples`
- confirm no secrets or generated live artifacts are included
- confirm any public docs still describe the current CLI behavior

## When adding a new CLI command

- implement logic in `src/cli/`
- add a bin wrapper if it should be public
- document the command in `README.md` and `docs/public_api.md`

## When adding a new mutation operation

- update `src/plan/validator.js`
- update `src/plan/mutation-runner.js`
- update `schemas/mutation-plan.schema.json`
- add tests and example plans


