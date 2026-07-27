---
name: amazon-brave-login
description: "Use when the Amazon browser session is stale and needs re-authentication through the dedicated Brave CDP debug browser at :9333."
---

# Amazon Brave CDP Login — Durable SOP

## When to use

- `amazon-kindle-cli doctor` shows cookie present but `wishlist list` redirects to sign-in
- `kindle send` returns 302 or stale session errors
- `amazon-orders-pp-cli doctor` reports `browser_session_proof: missing or stale`

## Preflight check

```bash
curl -s --max-time 3 http://127.0.0.1:9333/json/version
```

If no response: relaunch Brave with:

```powershell
powershell -ExecutionPolicy Bypass -File "$env:LOCALAPPDATA\amazon-kindle-debug-profile\launch-brave.ps1"
```

Wait 5 seconds, verify the JSON response has `webSocketDebuggerUrl`.

## Login flow

Use the Python script from the debug profile — NOT raw CUA clicks. Playwright handles the DOM better than AX tree for complex Amazon forms.

```bash
python "$env:LOCALAPPDATA/amazon-kindle-debug-profile/brave_amazon_login.py" --email coldz3@yahoo.com --password '<secret>'
```

The script:
1. Navigates to sign-in
2. Fills email and password
3. Waits for OTP challenge
4. Pauses — **ask Zayd for the OTP code**
5. Once code is provided:

```bash
python .../brave_amazon_login.py --otp 123456
```

The script then:
- Cancels any passkey save prompt
- Dumps all amazon.com cookies to `~/.amazon/auth.sh`
- Writes `~/.amazon/auth.bat` for Windows cmd
- Writes `~/.amazon/session-meta.json` (cookie names only — no values)

## Verify

```bash
source ~/.amazon/auth.sh
amazon-kindle-cli doctor          # expect signedInHint=true
amazon-kindle-cli wishlist list   # expect parsed items
amazon-kindle-cli kindle recent   # expect doc list
```

## Never do

- Do NOT try to decrypt Chrome cookies from an agent shell (ABE/DPAPI will fail)
- Do NOT rely on Chrome main profile port 9222
- Do NOT print cookie values, CSRF tokens, OTPs, customer IDs, device emails, or signed upload URLs
- Do NOT claim success from HTTP 200 alone — verify `signedInHint=true`

## Related reference

`docs/debug-browser-methodology.md` in the amazon-kindle-cli repo for full architectural rationale.
