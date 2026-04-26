# Auth Models

`funliday-automation-cli` supports two practical auth paths.

---

## 1. Browser-session mode (default, recommended)

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
   npx funliday-trip get --trip-id <tripId> --summary
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

Bypass Playwright entirely by feeding auth directly. Useful for CI / agent pipelines where running a headed Chrome is impractical.

### Auth file

```bash
npx funliday-trip get --trip-id <tripId> --auth-file ./auth.json
```

`auth.json` shape (any subset works as long as `cookie` and `authorization` are derivable):

```json
{
  "cookie": "fld-webToken=...",
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

### Environment variables

```bash
npx funliday-trip get --trip-id <tripId> --env-auth
```

- `FUNLIDAY_COOKIE`
- `FUNLIDAY_AUTHORIZATION`
- `FUNLIDAY_MEMBER_ID`
- `FUNLIDAY_ACCESS_TOKEN`
- `FUNLIDAY_DEVICE_ID`
- `FUNLIDAY_POIBANK_TOKEN`
- `FUNLIDAY_WEB_TOKEN`
- `FUNLIDAY_DEFAULT_LANGUAGE`

### Where to get these values

Open Chrome DevTools on `https://www.funliday.com`, then:
- `cookie` → `document.cookie`
- `localStorage`: `fld-memberId`, `fld-accessToken`, `fld-poibankToken`, `fld-clientId` (= deviceId)

For one-shot extraction, the simplest path is to run the CLI once in browser-session mode and copy what `funliday-trip get` writes — but **never commit these values**.

---

## Recommendation

- Local interactive use: **browser-session mode**.
- CI / agent automation: **env-var mode** with secrets managed by your runner.
- Plan development / offline review: **`--trip-snapshot`** with `funliday-mutate run --dry-run` (no auth or network needed). See `docs/dry_run_limitations.md`.
