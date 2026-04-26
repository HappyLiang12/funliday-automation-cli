# Auth Models

`funliday-automation-cli` supports two auth paths. They are designed for two different runtime environments.

| Path | Best for | Needs Chrome? | Needs network? |
|---|---|---|---|
| **Browser-session** (default) | Local interactive use on a developer machine | Yes (with `--remote-debugging-port`) | Yes |
| **Explicit auth** (`--auth-file` / `--env-auth`) | Sandboxed agents (OpenClaw, Hermes), CI runners, headless servers | **No** | Yes for live calls; **no** for offline dry-run |

**For sandboxed agents**, see `docs/agent_sandbox_setup.md` — it walks through the full split-stage flow (extract on a dev machine, ship to sandbox, detect expiry).

---

## 1. Browser-session mode

The CLI attaches to an already-running Chrome instance over the Chrome DevTools Protocol (CDP) and extracts your logged-in Funliday session from `localStorage` and cookies.

### Step-by-step

1. **Close all Chrome windows.** If Chrome is already running and you launch a second instance with `--remote-debugging-port`, Chrome will silently re-use the existing session and **not** open a CDP endpoint. There is no error.

2. **Launch Chrome with CDP enabled.** You must pass a non-default `--user-data-dir`; Chrome refuses CDP for the default profile.

   **Windows (PowerShell):**
   ```powershell
   & "$env:ProgramFiles\Google\Chrome\Application\chrome.exe" `
     --remote-debugging-port=9333 `
     --user-data-dir="$env:USERPROFILE\chrome-funliday" `
     https://www.funliday.com
   ```

   **macOS:**
   ```bash
   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
     --remote-debugging-port=9333 \
     --user-data-dir="$HOME/chrome-funliday" \
     https://www.funliday.com
   ```

   **Linux:**
   ```bash
   google-chrome \
     --remote-debugging-port=9333 \
     --user-data-dir="$HOME/chrome-funliday" \
     https://www.funliday.com
   ```

3. **Log in to Funliday in that Chrome window.** The fresh `--user-data-dir` is a clean profile, so it has no Funliday session yet. Log in once. The session persists in that profile across CLI runs.

4. **Verify CDP is reachable.**
   ```bash
   curl -s http://127.0.0.1:9333/json/version
   ```
   You should see a JSON response with `Browser`, `Protocol-Version`, etc.

5. **Run any CLI command.** The CLI auto-detects the running Chrome.
   ```bash
   npx funliday-trip get --trip-id <tripId> --summary --pois
   ```

### Default endpoint

- `http://127.0.0.1:9333`

Override with:

- `FUNLIDAY_CDP_ENDPOINT=...` (env var)
- `--endpoint <url>` (CLI flag on every subcommand)

### Common errors

| Error code | What it means | Fix |
|---|---|---|
| `CDP_UNREACHABLE` | Chrome isn't running with `--remote-debugging-port`, or the port is wrong. | Restart Chrome with the launch command above. Ensure no other Chrome instance is already running. |
| `NOT_LOGGED_IN` | CLI attached to Chrome but found no Funliday session. | Open `https://www.funliday.com` in that Chrome window and log in. |
| `CDP_CONNECT_FAILED` | Chrome is up but Playwright couldn't attach. | Confirm `curl http://127.0.0.1:9333/json/version` works; check firewall. |

---

## 2. Explicit auth mode

Use this for any environment that **cannot** run a desktop browser: CI, headless servers, sandboxed AI agents (OpenClaw, Hermes, etc.), serverless workers.

You feed auth into the CLI directly via either a JSON file (`--auth-file`) or environment variables (`--env-auth`). The CLI never touches Chrome / Playwright on this path.

### 2a. Get the values: `funliday-auth export`

The recommended way to produce the auth file is **on a developer machine** (which has Chrome) using the export subcommand:

```bash
# Steps 1–3: same as browser-session mode above (launch Chrome with CDP, log in once).

# Step 4: export self-contained auth.json
npx funliday-auth export --output ./funliday-auth.json
# OK [auth export]: wrote ./funliday-auth.json (fields: authorization, deviceId, language, cookie)
```

Default output (minimum viable):

```json
{
  "authorization": "Bearer <memberId>_<accessToken>",
  "deviceId": "<uuid>",
  "language": "zh_tw",
  "cookie": "fld-clientId=...; fld-webToken=...; fld-memberId=..."
}
```

Useful flags:
- `--include-cookie all` — keep the entire `document.cookie` (default `fld` keeps only Funliday cookies)
- `--include-cookie none` — omit the `cookie` field (only safe for endpoints that don't require it)
- `--include-tokens` — also write raw `memberId` / `accessToken` / `poibankToken` / `webToken`
- `--print` — also write the JSON to stdout (pipe into a secret manager)
- `--redact` — when used with `--print`, mask token values for safe inspection (logs, screenshots)

The output file is `chmod 0600` on POSIX. On Windows, store it in a directory only your user can read.

### 2b. Validate before shipping: `funliday-auth check`

```bash
# Structural check (no network)
npx funliday-auth check --auth-file ./funliday-auth.json

# End-to-end check against a known trip (cheap read-only call)
npx funliday-auth check --auth-file ./funliday-auth.json --trip-id <tripId>
# OK [auth check]: member=... deviceId=present trip=... pois=9 → ...
```

If credentials are stale, `check` returns `Error [AUTH_EXPIRED]:` — re-run the export.

### 2c. Use the auth in any command

```bash
npx funliday-trip get --trip-id <id> --auth-file ./funliday-auth.json --summary --pois
npx funliday-mutate run plan.json --auth-file ./funliday-auth.json
npx funliday-poibank "<keyword>" --auth-file ./funliday-auth.json
```

### 2d. Manual / hand-built auth file

If you cannot use `funliday-auth export` (e.g. extracting from someone else's browser via DevTools), the auth file accepts any subset that lets the CLI derive `authorization` + `cookie`:

```json
{
  "cookie": "fld-clientId=...; fld-webToken=...; fld-memberId=...",
  "authorization": "Bearer <memberId>_<accessToken>",
  "memberId": "<memberId>",
  "accessToken": "<accessToken>",
  "deviceId": "<uuid>",
  "language": "zh_tw",
  "poibankToken": "<token>",
  "webToken": "<token>"
}
```

If `authorization` is omitted, it is constructed automatically from `memberId + accessToken`, falling back to `webToken`.

To extract by hand: open Chrome DevTools on `https://www.funliday.com` after logging in, then:
- `cookie` → `document.cookie` (filter to `fld-*` entries)
- `localStorage`: `fld-memberId`, `fld-accessToken`, `fld-poibankToken`, `fld-clientId` (= `deviceId`)

### 2e. Environment variable mode

```bash
npx funliday-trip get --trip-id <id> --env-auth
```

Variables (set as many as your auth shape needs):

- `FUNLIDAY_COOKIE`
- `FUNLIDAY_AUTHORIZATION`
- `FUNLIDAY_MEMBER_ID`
- `FUNLIDAY_ACCESS_TOKEN`
- `FUNLIDAY_DEVICE_ID`
- `FUNLIDAY_POIBANK_TOKEN`
- `FUNLIDAY_WEB_TOKEN`
- `FUNLIDAY_DEFAULT_LANGUAGE`

Pipe the export file into env vars (handy for sandboxes that prefer env over files):

```bash
export FUNLIDAY_AUTHORIZATION="$(jq -r .authorization < funliday-auth.json)"
export FUNLIDAY_COOKIE="$(jq -r .cookie         < funliday-auth.json)"
export FUNLIDAY_DEVICE_ID="$(jq -r .deviceId    < funliday-auth.json)"
export FUNLIDAY_DEFAULT_LANGUAGE="$(jq -r .language < funliday-auth.json)"
```

### Common errors (explicit-auth mode)

| Error code | What it means | Fix |
|---|---|---|
| `AUTH_REQUIRED` | The CLI needs auth but none was provided. | Pass `--auth-file <file>` or `--env-auth`. |
| `AUTH_FILE_NOT_FOUND` | `--auth-file` path doesn't exist. | Resolve relative to the *current working directory*, not the repo root. |
| `AUTH_EXPIRED` | Funliday rejected the credentials (HTTP 401/403 or matching error message). | Re-export from a logged-in browser: `funliday-auth export --output funliday-auth.json`. |
| `FUNLIDAY_API_ERROR` (with `ErrorCodeUnknown`) | The body shape is wrong, not the auth. | See `docs/public_api.md` "funliday-api body shapes". |

---

## Recommendation

| Use case | Mode |
|---|---|
| Local interactive | Browser-session |
| Plan dev / offline review | Browser-session for the initial snapshot, then `--trip-snapshot` (no auth) for iteration |
| CI pipeline | `--env-auth` with the runner's secret store |
| **Sandboxed AI agent (OpenClaw, Hermes, …)** | **`--auth-file`** with the file mounted as a secret. See `docs/agent_sandbox_setup.md`. |
