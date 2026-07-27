---
name: amazon-kindle-cli
description: "Use when sending files to Kindle, reconciling Amazon books with Goodreads, or routing a photographed book to Amazon/Goodreads."
---

# Amazon / Kindle Book Mesh

## Trigger phrases
- send this EPUB/PDF to Kindle
- add this book to Amazon / Goodreads
- compare my Amazon reading list with Goodreads
- photo of book / bookstore shelf → want to read
- where did my Send-to-Kindle file go

## Preflight

```bash
source ~/.amazon/auth.sh
amazon-kindle-cli doctor
```

Requires the dedicated **Brave CDP** session, not Chrome main profile:

```text
CDP: http://127.0.0.1:9333
profile: %LOCALAPPDATA%\amazon-kindle-debug-profile
```

If stale: launch `launch-brave.ps1`, login using `brave_amazon_login.py`, request OTP, then verify `doctor.live.status=200` + `signedInHint=true`.

## Reading queue parity

Zayd Goodreads user is `179929687`.

```bash
amazon-kindle-cli parity --user 179929687 --shelf to-read
amazon-kindle-cli sync goodreads-plan --direction both
```

Match order: **ASIN → Goodreads ID → normalized title + author surname**. Never silently mutate a fuzzy match.

## Three Kindle paths

```bash
# Recommended: browser upload (Amazon's actual UI via Brave CDP)
amazon-kindle-cli kindle send book.epub --via browser --execute

# Direct HTTP alternate
amazon-kindle-cli kindle send book.epub --via web --execute

# SMTP fallback
amazon-kindle-cli kindle send book.epub --via email --execute

# Amazon converts async. Verify receipt:
amazon-kindle-cli kindle recent
```

## Photo / title intake

Vision/OCR gives title+author, then:

```bash
amazon-kindle-cli books resolve --text $'Title\nby Author'
amazon-kindle-cli add-plan --title 'Title' --author 'Author'

# Amazon list: browser-driven write, gated
amazon-kindle-cli wishlist add --asin BXXXXXXXXX --execute
# Goodreads: use goodreads-cli shelf add with its own auth
```

## Proven artifact

`C:\Users\ZaydK\Desktop\A_Parade_of_Horribles_-_Matt_Dinniman.epub`
was sent via Amazon web upload and verified `IN_LIBRARY` by `kindle recent`.

## Amazon Orders interoperability

The Amazon session is compatible with the Printing Press order CLI:

```bash
amazon-orders-pp-cli auth import --input ~/.amazon/session.portable.json
amazon-orders-pp-cli doctor
```

Use `amazon-orders-pp-cli` for order history/local SQLite analytics; use this CLI for books, Kindle, and Goodreads bridge.

## Related skills

| Skill | Use |
|---|---|
| `goodreads-cli` | shelf writes and Goodreads auth |
| `windows-browser-automation` | Brave/CDP recovery and UI fallback |
| `hermes-agent` | MCP config/reload |

## Reference docs

- `docs/debug-browser-methodology.md` — permanent browser/CDP SOP
- `docs/book-mesh.md` — current cross-surface topology
- `docs/canonical-procedures.md` — all working command recipes
