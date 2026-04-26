# Agent Sandbox Setup

This guide is for AI agents (e.g. **OpenClaw**, **Hermes**) and CI runners that execute `funliday-automation-cli` inside a sandbox **without** access to a desktop browser. The sandbox cannot run Chrome, so browser-session mode is unavailable. Instead, you split the auth lifecycle into two stages:

1. **Out-of-band extraction** on a developer machine that has Chrome.
2. **In-sandbox consumption** of a self-contained `auth.json` (or env vars).

The CLI already supports this — this doc just makes the workflow explicit.

---

## Stage 1 — Developer extracts auth (one-time, repeat on expiry)

On any machine where Chrome can run:

```bash
# 1. Close all Chrome windows.
# 2. Launch Chrome with CDP enabled and a dedicated profile:
#    (See docs/auth_models.md for Windows/macOS/Linux launch commands.)
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9333 \
  --user-data-dir="$HOME/chrome-funliday" \
  https://www.funliday.com

# 3. Log in to Funliday once in that window.

# 4. Export auth.json:
npx funliday-auth export --output ./funliday-auth.json
# OK [auth export]: wrote ./funliday-auth.json (fields: authorization, deviceId, language, cookie)
```

`funliday-auth export` writes a minimal, self-contained JSON the sandbox can consume. The file is `chmod 0600` on POSIX and contains only what the API actually needs.

### Default exported shape (minimum viable)

```json
{
  "authorization": "Bearer <memberId>_<accessToken>",
  "deviceId": "<uuid>",
  "language": "zh_tw",
  "cookie": "fld-clientId=...; fld-webToken=...; fld-memberId=..."
}
```

- `cookie` is filtered to only `fld-*` cookies (Funliday's own); set `--include-cookie all` to keep the full document cookie or `--include-cookie none` to omit it.
- Tokens (`memberId`, `accessToken`, `poibankToken`, `webToken`) are **not** exported by default — the `authorization` header and `cookie` already carry the credentials Funliday needs. Pass `--include-tokens` if your sandbox needs the raw token values for re-signing or auditing.

### Verify the export before shipping

```bash
npx funliday-auth check --auth-file ./funliday-auth.json --trip-id <some-known-trip-id>
# OK [auth check]: member=... deviceId=present trip=... pois=9 → ...
```

`--trip-id` is optional. With it, `check` performs a real read-only `getPoisOfTrip` call — proving the credentials work end-to-end. Without it, `check` only validates the JSON structure.

---

## Stage 2 — Move auth into the sandbox

Pick whichever transport your runtime supports. **Never commit `funliday-auth.json`.**

### Option A: file mount

```bash
# OpenClaw / Hermes: mount the file as a read-only secret
sandbox-cli secret put funliday-auth < ./funliday-auth.json

# Inside the sandbox:
npx funliday-trip get --trip-id <id> --auth-file /secrets/funliday-auth.json --summary --pois
```

### Option B: environment variables

If your sandbox prefers env vars, pipe the file into an env config:

```bash
export FUNLIDAY_AUTHORIZATION="$(jq -r .authorization < funliday-auth.json)"
export FUNLIDAY_COOKIE="$(jq -r .cookie         < funliday-auth.json)"
export FUNLIDAY_DEVICE_ID="$(jq -r .deviceId    < funliday-auth.json)"
export FUNLIDAY_DEFAULT_LANGUAGE="$(jq -r .language < funliday-auth.json)"

# Inside the sandbox:
npx funliday-trip get --trip-id <id> --env-auth --summary --pois
```

The full env-var list is in `docs/auth_models.md`.

### Option C: stdout pipe (for secret managers)

```bash
npx funliday-auth export --print --include-cookie fld | \
  vault kv put secret/funliday/auth -
```

Add `--redact` when piping to a non-secret destination (e.g. logs, screenshots) — token values are masked but the field structure is preserved.

---

## Stage 3 — Sandbox-side flow

In the sandbox, every command takes the same auth flag:

```bash
# Read-only verification
npx funliday-trip get --trip-id $TRIP --auth-file ./funliday-auth.json --summary --pois --quiet

# Snapshot for offline plan iteration
npx funliday-api getPoisOfTrip "{\"tripId\":\"$TRIP\"}" \
  --auth-file ./funliday-auth.json --output ./snapshot.json --quiet

# Offline dry-run (no auth, no network beyond the snapshot already on disk)
npx funliday-mutate run plan.json --dry-run --trip-snapshot ./snapshot.json --quiet

# Live execute
npx funliday-mutate run plan.json --auth-file ./funliday-auth.json --quiet
```

`--quiet` suppresses the human-readable summary line so stdout is empty on success — useful for pipelines that grep for explicit failure markers.

---

## Stage 4 — Detecting auth expiry

Funliday tokens are time-bound. When they expire, every API call starts failing. The CLI surfaces this as a **dedicated error code**:

```
Error [AUTH_EXPIRED]: getPoisOfTrip failed: auth appears expired (HTTP 401 / ...). Re-export auth.json from a logged-in browser.
Hint: re-export auth from a logged-in browser: `funliday-auth export --output ./funliday-auth.json` ...
```

Detection rules:
- HTTP `401` or `403`
- Response `status` field equal to `401` or `403`
- Response message matching `invalid access token`, `token expired`, `unauthorized`, `please log in`, or the localized Chinese variants `請重新登入` / `登入逾時` / `未登入`

### Recommended agent loop

```text
1. Run command.
2. If exit 0 → continue.
3. If stderr starts with `Error [AUTH_EXPIRED]:` → stop, surface a "needs new auth"
   signal to the orchestrator, and request a fresh export from Stage 1.
4. If stderr starts with `Error [AUTH_REQUIRED]:` or `[AUTH_FILE_NOT_FOUND]:` →
   the auth file is missing or malformed; same recovery.
5. Any other `Error [...]:` → surface to the user; do not retry blindly.
```

Programmatic check:

```bash
funliday-trip get --trip-id $TRIP --auth-file ./auth.json --quiet 2> .err
case "$(grep -oE '^Error \[[A-Z_]+\]:' .err | head -1)" in
  "Error [AUTH_EXPIRED]:" | "Error [AUTH_REQUIRED]:" | "Error [AUTH_FILE_NOT_FOUND]:")
    echo "auth refresh needed"; exit 75 ;;
  "")  : ;;
  *)   cat .err; exit 1 ;;
esac
```

---

## Threat model & secret hygiene

- `funliday-auth.json` grants the same access as a logged-in session. Treat it as a long-lived credential.
- Use a dedicated Funliday account for automation; do not use a personal one.
- The exported `cookie` already excludes non-Funliday entries (`fld-*` only by default), but it still contains a session token. **Never log it, never echo it to PR descriptions, never commit it.** The repo's `.gitignore` already excludes `artifacts/` for this reason.
- Tokens rotate when the user re-logs-in or when Funliday invalidates them server-side. Plan for periodic re-export (cadence depends on Funliday's expiry policy — empirically, sessions persist for at least several days but this is not a contract).
- `funliday-auth export` does not persist credentials anywhere except the file you pass to `--output`. It does not phone home; it does not write logs.
- On Linux/macOS, the export is `chmod 0600`. On Windows, NTFS ACLs are not modified — store the file in a directory only your user can read.

---

## What the sandbox does **not** need

- Chrome or Chromium binaries
- Playwright (only the `funliday-automation-cli` package itself; the Playwright dependency is loaded lazily and never invoked when `--auth-file` / `--env-auth` is passed)
- CDP port `9333`
- Network access to anything other than `https://www.funlidays.com`, `https://www.funliday.com`, and `https://api.poibank.com`

You can verify by running the CLI in a network-restricted environment with a saved `--trip-snapshot` — every offline command works without any outbound traffic.

---

## Quick reference

| Need | Command |
|---|---|
| One-time export | `funliday-auth export --output funliday-auth.json` |
| Validate (structure only) | `funliday-auth check --auth-file funliday-auth.json` |
| Validate (live, end-to-end) | `funliday-auth check --auth-file funliday-auth.json --trip-id <id>` |
| Read trip in sandbox | `funliday-trip get --trip-id <id> --auth-file <file> --summary --pois --quiet` |
| Snapshot | `funliday-api getPoisOfTrip '{"tripId":"<id>"}' --auth-file <file> --output snapshot.json --quiet` |
| Offline dry-run | `funliday-mutate run plan.json --dry-run --trip-snapshot snapshot.json --quiet` |
| Live mutate | `funliday-mutate run plan.json --auth-file <file> --quiet` |
| Detect expiry | exit code 1 + stderr `Error [AUTH_EXPIRED]:` |
