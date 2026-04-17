# Security Policy

Repository:

- `https://github.com/HappyLiang12/funliday-automation-cli`

## Sensitive data

Do not commit any of the following:

- browser storage dumps
- cookies
- bearer tokens
- signed URLs
- account-specific response artifacts
- personal itinerary data

## Generated outputs

This project can write JSON artifacts containing request/response metadata.
Treat everything under `artifacts/` as potentially sensitive.

## Reporting a security issue

If you discover a serious security issue in this project, report it privately to the repository maintainer before opening a public issue.

Until a dedicated private security contact is published, avoid posting exploitable details, live credentials, or sensitive artifacts in public GitHub issues.

## Operational safety

- prefer sanitized demo fixtures in tests
- prefer `validate` before `run`
- review Terms of Service impact before using this against real accounts
- store any local auth JSON files outside the repository whenever possible


