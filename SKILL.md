---
name: amazon-kindle-cli
description: "Use when sending files to Kindle, reconciling Amazon books with Goodreads, or routing a photographed book to Amazon/Goodreads."
---

# Amazon / Kindle Book Mesh

## Zero-thought intent router

| User says | Use |
|---|---|
| Put this EPUB/PDF in my Kindle app/library | `amazon-kindle-cli kindle send FILE --via web --execute`, then `kindle recent` |
| Show my purchased Kindle ebooks | `amazon-kindle-cli kindle books --limit N` — **experimental, fixture-verified** MYCD Ebook inventory; not a wishlist or upload receipt |
| Show my Personal Documents | `amazon-kindle-cli kindle pdocs --limit N` — **experimental, fixture-verified** MYCD PDoc metadata inventory; not `kindle recent` |
| Show recent Send-to-Kindle activity | `amazon-kindle-cli kindle recent --limit N` — receipts only, not the whole Personal Document library |
| Add this title to my Amazon list | resolve title → ASIN → `wishlist add --asin ASIN --execute`, then full paginated `wishlist list` verify |
| Add this title to Goodreads / want-to-read | resolve numeric Goodreads ID → `goodreads-cli shelves add --book-id ID --name to-read --execute` |
| Add this title to my Kindle library, but no legal file exists | Do not fake ownership. Use wishlist/to-read or request explicit purchase approval. |

Use CLI first. Amazon auth auto-loads in a cold shell. Browser/CDP is only for auth recovery or new contract research. HTTP 200 alone is not proof; always verify the resulting receipt/list/shelf state.

## Trigger phrases
- send this EPUB/PDF to Kindle
- add this book to Amazon / Goodreads
- compare my Amazon reading list with Goodreads
- photo of book / bookstore shelf → want to read
- where did my Send-to-Kindle file go

## Preflight

```bash
amazon-kindle-cli auth status
amazon-kindle-cli auth verify
```

The CLI auto-loads `~/.amazon/auth.sh` from a cold shell. MCP is optional. Brave CDP is used only to refresh/capture the stored session when verification fails:

```text
CDP: http://127.0.0.1:9333
profile: %LOCALAPPDATA%\amazon-kindle-debug-profile
```

If stale: first harvest the already-authenticated Brave session with `brave_amazon_login.py --cookies-only`; request login/OTP only if the browser is genuinely signed out. Then use `auth verify`: require `readReady=true` for read workflows and `retailWriteReady=true` before wishlist mutations.

## Reading queue parity

Zayd Goodreads user is `179929687`.

```bash
amazon-kindle-cli parity --user 179929687 --shelf to-read
amazon-kindle-cli sync goodreads-plan --direction both
```

Match order: **ASIN → Goodreads ID → normalized title + author surname**. Never silently mutate a fuzzy match.

## Two Kindle product paths

```bash
# Default: pure HTTP Send-to-Kindle web upload
amazon-kindle-cli kindle send book.epub --via web --execute

# SMTP fallback
amazon-kindle-cli kindle send book.epub --via email --execute

# Amazon converts async. This is a recent-receipts view, not full PDoc inventory:
amazon-kindle-cli kindle recent --limit 25
```

## Kindle inventory reads

```bash
# Purchased Kindle Ebook ownership metadata (MYCD); not the wishlist.
amazon-kindle-cli kindle books --limit 100

# Personal Document ownership metadata (MYCD); not just recent STK receipts.
amazon-kindle-cli kindle pdocs --limit 100
```

**Status: experimental / fixture-verified only.** Both commands use the observed MYCD shell-CSRF → `POST /hz/mycd/digital-console/ajax` (`GetContentOwnershipData`, `MYCD_WebService`) contract and have deterministic synthetic-fixture coverage; they have not been independently authenticated-live-verified. Output is metadata only: it never includes cookies, CSRF, download/action URLs, or private document bytes. `--limit` is an intentional bounded view; inspect `truncated` before treating it as complete.

## Photo / title intake

Vision/OCR gives title+author, then:

```bash
amazon-kindle-cli books resolve --text $'Title\nby Author'
amazon-kindle-cli add-plan --title 'Title' --author 'Author'

# Amazon list: pure HTTP write, gated
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
