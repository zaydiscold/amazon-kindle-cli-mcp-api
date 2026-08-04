# Debug Browser & Amazon/Kindle Methodology

This is the permanent working setup. No guessing, no Chrome-cookie spelunking.

## Why Brave exists

Chrome's normal profile uses **App-Bound Encryption** and exposed a broken CDP listener (`:9222` returned 404). Even with a successful Amazon login, native shell decrypt and Playwright CDP could not reliably read real cookies.

**The solution is a dedicated automation browser — Brave — not a hack around Chrome.**

```text
Browser: Brave
CDP:     http://127.0.0.1:9333
Profile: %LOCALAPPDATA%\amazon-kindle-debug-profile
Auth:    Amazon login once, then cookies are available via CDP
```

## Launch / recovery

```powershell
powershell -ExecutionPolicy Bypass -File `
  "$env:LOCALAPPDATA\amazon-kindle-debug-profile\launch-brave.ps1"

curl http://127.0.0.1:9333/json/version
```

Expected: `webSocketDebuggerUrl` JSON. If not, relaunch Brave using the flags:

```text
--remote-debugging-port=9333
--remote-allow-origins=*
--user-data-dir=%LOCALAPPDATA%\amazon-kindle-debug-profile
--no-first-run --no-default-browser-check
```

## Amazon login + cookie persistence

```bash
# Navigate the dedicated profile to sign-in and complete credentials/OTP manually.
# Never pass account secrets on a command line.
python "$LOCALAPPDATA/amazon-kindle-debug-profile/brave_amazon_login.py" --goto-signin
# After interactive sign-in completes, persist origin-scoped cookies only:
python "$LOCALAPPDATA/amazon-kindle-debug-profile/brave_amazon_login.py" --cookies-only
```

The helper writes:

- `~/.amazon/auth.sh` — `AMAZON_COOKIE`, shell sourceable, 600
- `~/.amazon/auth.bat` — Windows cmd form
- `~/.amazon/session-meta.json` — names/counts only, never values
- `~/.amazon/config.json` — local Kindle device/address metadata only

## Validate every time

```bash
source ~/.amazon/auth.sh
amazon-kindle-cli doctor
amazon-kindle-cli wishlist list
amazon-kindle-cli kindle recent
```

`doctor.live.status=200` plus `signedInHint=true` is required before claiming auth is good.

## Send-to-Kindle product route

### Browser capture — never product transport

Use CDP only to refresh the origin-scoped buyer session or research a new contract. Do not run browser upload/scroll workflows as a CLI fallback; product runtime stays pure HTTP (or the separately configured SMTP path).

### HTTP route — discovered live

| Stage | Request |
|---|---|
| session/CSRF | `GET /sendtokindle` → `anti-csrftoken-a2z` |
| init | `POST /sendtokindle/init` → signed `uploadUrl` |
| transfer | `PUT uploadUrl` bytes |
| finalize | `POST /sendtokindle/send-v2` |
| receipt | `GET /sendtokindle/recent-docs` |

**Live proof:** `A_Parade_of_Horribles_-_Matt_Dinniman.epub` (2,891,674 bytes) was uploaded; `send-v2` returned `{status:true}`; `recent-docs` then reached `IN_LIBRARY`.

Never call the web executor twice just to "test" it. Test with plans; verify existing receipts.

## Goodreads

- Zayd Goodreads user: `179929687`
- `to-read` RSS is public/readable and returns 100 items/page
- Goodreads cookie remains separate from Amazon.
- Match contract: ASIN exact → Goodreads id exact → normalized title + author last name.

## Printing Press interoperability

`amazon-orders-pp-cli` accepts our session export:

```bash
amazon-orders-pp-cli auth import --input ~/.amazon/session.portable.json
amazon-orders-pp-cli auth status
amazon-orders-pp-cli doctor
```

Verified: import succeeded and reports `Authenticated` / `configured (browser session)`.

## Never do these again

- Don't decrypt Chrome's `Cookies` DB from an agent shell: ABE/DPAPI will fail.
- Don't rely on `chrome://inspect` main-profile port 9222.
- Don't print cookie values, CSRF tokens, OTPs, customer IDs, device email addresses, or signed upload URLs.
- Don't claim Kindle delivery at `send-v2`: Amazon conversion is async; poll `kindle recent` until `IN_LIBRARY`/`COMPLETE`.
