# Release Checklist

Use this checklist before pushing a public release of `funliday-automation-cli`.

## Repository hygiene

- [ ] No `node_modules/` committed
- [ ] No `artifacts/` committed
- [ ] No cookies, tokens, signed URLs, or account-specific outputs committed
- [ ] Example files use fake IDs and sanitized payloads only

## Package metadata

- [ ] `package.json` repository URL is correct
- [ ] version is updated
- [ ] `LICENSE` exists and is Apache-2.0
- [ ] homepage / bugs links are valid

## Documentation

- [ ] `README.md` reflects actual CLI usage
- [ ] disclaimers are present and clear
- [ ] `SECURITY.md` and `CONTRIBUTING.md` are up to date
- [ ] schema/docs still match implemented behavior

## Verification

- [ ] `npm test`
- [ ] `npm run validate:examples`
- [ ] `npm run smoke:help`

## GitHub launch

- [ ] default branch is `main`
- [ ] remote origin points to `https://github.com/HappyLiang12/funliday-automation-cli`
- [ ] initial commit message is ready
- [ ] release notes / repo description prepared

