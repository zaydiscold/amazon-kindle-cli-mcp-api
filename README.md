# amazon-kindle-cli

**Kindle-first** Amazon CLI + MCP. Unofficial. One engine, CLI↔MCP parity, dry-run by default.

Bookstore photo → wishlist ASIN → Goodreads `to-read`. EPUB on disk → Send to Kindle. Agent-native.

## Why this exists

Sibling of [goodreads-cli-mcp-api](https://github.com/zaydiscold/goodreads-cli-mcp-api) and [robinhood-cli-mcp-api](https://github.com/zaydiscold/robinhood-cli-mcp-api).  
**Not** bolted onto Goodreads — separate cookie surface, orchestrated together.

Hero paths:

1. **`kindle send`** — EPUB/PDF → your `@kindle.com` address (SMTP, no Amazon cookie)
2. **`wishlist list`** — buyer session → ASINs/titles for Goodreads bridge
3. **`sync goodreads-plan`** — dry-run map wishlist → `goodreads_shelf_add`

## Quick start

```bash
pnpm install && pnpm build && pnpm test

# Amazon session (Brave CDP debug browser on :9333 is the supported path)
source ~/.amazon/auth.sh   # from brave_amazon_login.py dump
amazon-kindle-cli doctor
amazon-kindle-cli wishlist list

# Send to Kindle (needs KINDLE_EMAIL + SMTP_*)
export KINDLE_EMAIL=you_xxx@kindle.com
export SMTP_HOST=... SMTP_USER=... SMTP_PASS=...
amazon-kindle-cli kindle send ./book.epub           # dry-run plan
amazon-kindle-cli kindle send ./book.epub --execute # live
```

## Auth

| Surface | Env | Notes |
|---|---|---|
| Buyer web (wishlist, content) | `AMAZON_COOKIE` | Browser session. Chrome ABE blocks silent DB decrypt — use Brave CDP debug profile or Cookie-Editor import |
| Send to Kindle | `KINDLE_EMAIL` + `SMTP_*` | No cookie required. Approve sender in Amazon Personal Document Settings |

```bash
amazon-kindle-cli auth import --file cookies.json
amazon-kindle-cli auth status
```

Dedicated debug browser (already set up on mothership):

```text
Brave --remote-debugging-port=9333
--user-data-dir=%LOCALAPPDATA%\amazon-kindle-debug-profile
login script: %LOCALAPPDATA%\amazon-kindle-debug-profile\brave_amazon_login.py
```

## CLI

```text
doctor
auth status | import --file
wishlist list [--url] [--fixture]
kindle send <files...> [--kindle-email] [--execute]
content devices
sync goodreads-plan
```

## MCP tools

| Tool | Risk |
|---|---|
| `amazon_kindle_doctor` | read |
| `amazon_kindle_auth_status` | read |
| `amazon_kindle_auth_import` | write-safe |
| `amazon_kindle_wishlist_list` | read |
| `amazon_kindle_send_plan` | read |
| `amazon_kindle_send` | write-mutate (execute gate) |
| `amazon_kindle_content_devices` | read |
| `amazon_kindle_goodreads_sync_plan` | read |

Profiles: `AMAZON_KINDLE_MCP_PROFILE=full|core`

Bootstrap: `scripts/amazon-kindle-mcp.cmd` / `.sh`

## Invariants

1. One engine — logic in `cli/src/engine.ts`
2. Reads free, writes gated (`--execute`)
3. Kindle-first
4. Never print secrets
5. Redaction-first wishlist output (ASIN/title/author only)

## License

MIT
