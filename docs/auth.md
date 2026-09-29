# Auth — Amazon / Kindle

One canonical auth reference. Browser/CDP is for **auth capture only**; the product
runtime is pure HTTP (the CLI auto-loads `~/.amazon/auth.sh`).

## Two credential surfaces

| Surface | Env | How |
|---|---|---|
| Amazon buyer web + Send-to-Kindle web | `AMAZON_COOKIE` | Persisted browser session; CLI auto-loads `~/.amazon/auth.sh` |
| Send-to-Kindle email fallback | `KINDLE_EMAIL` + SMTP | Independent email path; whitelist the SMTP sender address |

The `AMAZON_COOKIE` is a **long-lived** session (weeks/months). Send-to-Kindle and MYCD
do **not** re-prompt for login every time; they enforce a *freshness window*
(`openid.pape.max_auth_age`, observed at 3600 s), which is a **step-up, not a re-login**.

## The deterministic auth SOP (do not waver)

Run these in order. Never conclude "auth is broken" from a pre-harvest snapshot.

```bash
# 1. Prove the current state on the live surfaces.
amazon-kindle-cli auth verify
#    kindleAuthenticated=true + retailWriteReady=true  ->  DONE, proceed.
```

If not:

```bash
# 2. Harvest the existing Brave session BEFORE deciding it's dead.
python "$LOCALAPPDATA/amazon-kindle-debug-profile/brave_amazon_login.py" --cookies-only
amazon-kindle-cli auth verify   # re-check
```

If **still** not `kindleAuthenticated`:

```text
3. Drive Brave to https://www.amazon.com/sendtokindle and click the sign-in /
   step-up button (id="s2k-dnd-sign-in-button").
   - If the retail session is still fresh, this completes WITHOUT a password prompt.
   - If a password field actually appears, supply it via the vault (below) — never inline.
4. Re-harvest the FULL jar (--cookies-only), then re-run auth verify.
5. Only request an OTP when an OTP field literally appears; enter it via
   browser_vault_enter_code, never by asking for it in chat.
```

Why this works: the step-up re-mints the sendtokindle scope on top of the still-valid
retail session. Re-harvesting afterwards captures it. The failure mode to avoid is
analysing the *old* jar, deciding the wall is permanent, and never re-verifying after the
re-auth that actually fixes it.

### Diagnostic signature (identify auth vs code fast)

- `auth verify` → `readReady:false`, `retailReadable:false`, but `retailSessionMode:"authenticated"`
- wishlist list → **302 to `/hz/wishlist/intro`** (signed-out bounce)
- `kindle recent` / `kindle send` → `SyntaxError: Unexpected end of JSON input`
- `/sendtokindle` HTML contains "Sign in to send files", and **no** `<input name="csrfToken">`
- page contains `id="s2k-dnd-sign-in-button"`

Signed-out HTML or a sign-in redirect ⇒ **auth** (fix auth, not code). A real JSON error
body naming a field ⇒ **code**.

## Capturing the session (supported paths only)

Chrome **App-Bound Encryption** blocks silent cookie-DB decrypt. Supported:

1. **Brave CDP debug profile** (preferred for agents) — port `9333`, profile
   `%LOCALAPPDATA%\amazon-kindle-debug-profile`; the helper dumps `~/.amazon/auth.sh`.
2. **Cookie-Editor export** → `amazon-kindle-cli auth import --file …`
3. **Manual** `export AMAZON_COOKIE='…'`

The CLI auto-loads `~/.amazon/auth.sh`; humans, cron, and scripts never `source` it and
never need an MCP server running. `auth status` is metadata only — `auth verify` is the
proof, and it reports `readReady`, `retailWriteReady`, and `kindleAuthenticated`
independently; inspect each. `auth verify` proves retail + Send-to-Kindle; MYCD may
separately require a fresh sign-in window, so refresh persisted auth when `kindle books` /
`kindle pdocs` redirects to sign-in.

## Assisted sign-in (the vault)

When a password prompt genuinely appears, the agent drives the *flow* and the operator
supplies the *secret* through the vault — the password never enters the transcript.

1. Operator stores the login once: `hermes vault add` (or Desktop → Settings → Passwords &
   Logins).
2. Agent types the identifier with `fill_input`, then `browser_vault_fill` enters the
   password (resolved server-side).
3. One-time code appears → `browser_vault_enter_code`.
4. Re-harvest the full jar and verify on a live surface.

Why the vault, not an inline secret: `--password <value>` on a CLI helper leaks into shell
history and process listings; a password pasted into chat lands in the platform's storage.
The vault keeps it out of both **and** keeps the flow working in cron/headless sessions.

### Headless force-add

If there is no interactive session to run `hermes vault add`, the agent may add the item
programmatically through the real `VaultStore` code path (same format the browser fill reads
back). Only under explicit operator authorization with a supplied credential — never source
the password from the transcript or a guess.

```python
import sys
from pathlib import Path
sys.path.insert(0, "<HERMES_AGENT_SRC>")   # e.g. the hermes-agent checkout
from agent.vault_store import VaultStore
store = VaultStore(base_dir=Path("<HERMES_HOME>/vault"))
# idempotent-guard first: skip if list_items() already has the origin
store.add_item(
    kind="login",
    label="Amazon",
    secret={"identifier_type": "email", "identifier": "<email>", "password": "<pw>"},
    origin="https://www.amazon.com",
)
```

Delete any temp script holding the literal password immediately; verify with
`browser_vault_list` (handle must show `available: true`).

## Gotchas

- Chrome ABE: use the Brave debug browser or Cookie-Editor import, never native cookie-DB
  decrypt.
- Goodreads is a **separate** cookie — bridge only.
- Passkey prompts steal password flows — disable WebAuthn in automation; passkey is local
  biometrics and is not a remote workaround.
- Cookie *count* is not proof. The missing thing is a *scope*, not a number of cookies.
- Always back up `~/.amazon/auth.sh` before rewriting it (e.g. `auth.sh.pre-<change>`).

## Never do these again

- Don't decrypt Chrome's `Cookies` DB from an agent shell (ABE/DPAPI fails).
- Don't rely on a main-profile CDP port (e.g. `:9222`).
- Don't print cookie values, CSRF tokens, OTPs, customer IDs, device emails, or signed
  upload URLs.
- Don't claim Kindle delivery at `send-v2` — poll `kindle recent` until `IN_LIBRARY`/`COMPLETE`.
- Never commit auth files.
