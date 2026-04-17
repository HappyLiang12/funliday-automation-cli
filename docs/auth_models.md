# Auth Models

## 1. Browser-session mode

This is the primary mode.

Requirements:

- an already logged-in browser session
- CDP endpoint available
- local browser storage/cookies still valid

Default endpoint:

- `http://127.0.0.1:9333`

## 2. Explicit auth mode

You can bypass Playwright session extraction by providing auth directly.

### Auth file mode

```json
{
  "cookie": "fld-webToken=...",
  "authorization": "Bearer ...",
  "deviceId": "demo-device",
  "language": "zh_tw",
  "poibankToken": "demo-token"
}
```

### Environment variable mode

- `FUNLIDAY_COOKIE`
- `FUNLIDAY_AUTHORIZATION`
- `FUNLIDAY_DEVICE_ID`
- `FUNLIDAY_MEMBER_ID`
- `FUNLIDAY_ACCESS_TOKEN`
- `FUNLIDAY_POIBANK_TOKEN`
- `FUNLIDAY_WEB_TOKEN`
- `FUNLIDAY_DEFAULT_LANGUAGE`

## Recommendation

For real usage, prefer browser-session mode first.
For automation pipelines, explicit-auth mode is more controllable but requires careful secret handling.

