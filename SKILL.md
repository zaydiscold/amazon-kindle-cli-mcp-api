---
name: amazon-kindle-cli
description: "Use when working with Amazon wishlists, Send-to-Kindle, Kindle content, or bridging Amazon books to Goodreads. Kindle-first sibling of goodreads-cli."
---

# amazon-kindle-cli

## Triggers
- send epub/pdf to kindle
- list amazon wishlist
- amazon → goodreads to-read
- KINDLE_EMAIL / AMAZON_COOKIE

## Auth
```bash
source ~/.amazon/auth.sh   # from Brave CDP dump
# or
amazon-kindle-cli auth import --file cookies.json
```

Send-to-Kindle only needs `KINDLE_EMAIL` + SMTP_*.

## Commands
```bash
amazon-kindle-cli doctor
amazon-kindle-cli wishlist list
amazon-kindle-cli kindle send ./book.epub              # dry-run
amazon-kindle-cli kindle send ./book.epub --execute
amazon-kindle-cli sync goodreads-plan
```

## MCP
Tools: `amazon_kindle_doctor`, `amazon_kindle_wishlist_list`, `amazon_kindle_send`, `amazon_kindle_send_plan`, `amazon_kindle_goodreads_sync_plan`, …

## Debug browser
Brave `:9333`, profile `amazon-kindle-debug-profile`. Chrome main profile CDP is unreliable; do not thrash it.

## Related
| Skill | Why |
|---|---|
| goodreads-cli | shelf add after wishlist resolve |
| hermes-agent | MCP wiring |
