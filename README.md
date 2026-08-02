# amazon-kindle-cli

**HTTP-first** Kindle + Amazon list CLI/MCP. Unofficial. One engine, CLI↔MCP parity, dry-run by default.

**Product paths are scriptable requests only.** Browser/CDP is for cookie capture + contract mapping — never scroll/click runtime.

| Flow | HTTP |
|---|---|
| wishlist list | `GET /hz/wishlist/ls/{id}` + `GET /hz/wishlist/slv/items?paginationToken=` |
| wishlist add | `GET /dp/{ASIN}` CSRF → `POST /hz/wishlist/additemtolist?ie=UTF8` |
| kindle send | `init → PUT → send-v2 → recent-docs` |
| kindle recent | `GET /sendtokindle/recent-docs` |

Sibling Goodreads parity: [goodreads-cli-mcp-api](https://github.com/zaydiscold/goodreads-cli-mcp-api).


# amazon-kindle-cli

**Kindle-first** Amazon CLI + MCP. Unofficial. One engine, CLI↔MCP parity, dry-run by default.

Bookstore photo → wishlist ASIN → Goodreads `to-read`. EPUB on disk → Send to Kindle. Agent-native.

> **Bookstore photos → lists (live).** Snap stacks in a shop, resolve titles/ASINs, then `wishlist add --execute`. With sibling [goodreads-cli-mcp-api](https://github.com/zaydiscold/goodreads-cli-mcp-api) (`shelves add --name to-read`) you get **parity both ways**: Goodreads Want to Read ↔ Amazon wishlist / Kindle surface on the same haul. `parity` + `sync goodreads-plan` are the bridge commands.

**Last shipped update (feature branch):** default Kindle send path is **API web upload** (`--via web`), not browser automation. See PR [#1](https://github.com/zaydiscold/amazon-kindle-cli-mcp-api/pull/1).

## Why this exists

Sibling of [goodreads-cli-mcp-api](https://github.com/zaydiscold/goodreads-cli-mcp-api) and [robinhood-cli-mcp-api](https://github.com/zaydiscold/robinhood-cli-mcp-api).  
**Not** bolted onto Goodreads — separate cookie surface, orchestrated together for list parity.

Hero paths:

1. **`kindle send`** — EPUB/PDF → your `@kindle.com` address (web upload default; SMTP also available)
2. **`wishlist list` / `wishlist add`** — buyer session → ASINs/titles; photo-haul adds land here
3. **`parity` / `sync goodreads-plan`** — dry-run map wishlist ↔ Goodreads `to-read` (execute shelves on the Goodreads CLI)

## Quick start

```bash
pnpm install && pnpm build && pnpm test

# Persisted Amazon session auto-loads from ~/.amazon/auth.sh
amazon-kindle-cli auth verify   # proves retail wishlist + Kindle independently
amazon-kindle-cli wishlist list

# HTTP web upload is the default product path
amazon-kindle-cli kindle send ./book.epub
amazon-kindle-cli kindle send ./book.epub --execute
```

## Wishlist HTTP (default)

`wishlist add --asin … --execute` → `GET /dp/{ASIN}` (CSRF from `#addToWishListForm`) → `POST /hz/wishlist/additemtolist`.
Browser/CDP is auth capture and contract research only, never a product runtime.

## Auth

| Surface | Env | Notes |
|---|---|---|
| Buyer web (wishlist, content, Send-to-Kindle web) | `AMAZON_COOKIE` | Persisted in `~/.amazon/auth.sh`; the CLI auto-loads it from a cold shell |
| Send to Kindle | `KINDLE_EMAIL` + `SMTP_*` | No cookie required. Approve sender in Amazon Personal Document Settings |

```bash
amazon-kindle-cli auth import --file cookies.json
amazon-kindle-cli auth status
amazon-kindle-cli auth verify
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
auth status | verify [--list-id] | import --file
wishlist list
wishlist add --asin | --title [--execute]
kindle send <files...> [--via web|email] [--execute]
kindle recent
parity [--user] [--shelf]
sync goodreads-plan [--direction both]
books resolve --title|--text
add-plan --title|--text
content devices
```

## MCP tools

| Tool | Risk |
|---|---|
| `amazon_kindle_doctor` | read |
| `amazon_kindle_auth_status` | read |
| `amazon_kindle_auth_verify` | read |
| `amazon_kindle_auth_import` | write-safe |
| `amazon_kindle_wishlist_list` | read |
| `amazon_kindle_wishlist_add` | write-mutate (browser + execute gate) |
| `amazon_kindle_send_plan` | read |
| `amazon_kindle_send` | write-mutate (execute gate) |
| `amazon_kindle_recent_docs` | read |
| `amazon_kindle_parity` | read |
| `amazon_kindle_goodreads_sync_plan` | read |
| `amazon_kindle_books_resolve` / `amazon_kindle_add_plan` | read |

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

### Haul + sync tips
- Prefer one ASIN per work (avoid study-guide / wrong-title search hits).
- After bulk adds, open the list sorted by **date-added** and scroll — Amazon lazy-loads; a short first paint is not the full list.
- Bidirectional parity: `parity` / `sync goodreads-plan` here + Goodreads `shelves add/remove`. Sibling: https://github.com/zaydiscold/goodreads-cli-mcp-api
- Product direction: simple web app — OAuth/session login for Amazon + Goodreads, drag bookstore photos, dual-list add + sync.
