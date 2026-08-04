# amazon-kindle-cli

Unofficial **HTTP-first** Amazon/Kindle CLI and optional MCP server. Product reads/writes use scriptable HTTP; browser/CDP is only for session capture and contract research. One shared engine projects to CLI and MCP. Mutations remain `--execute` gated.

## Read surfaces

| Need | Command | What it is / is not |
|---|---|---|
| Reading queue | `wishlist list [--limit N]` | Full HTTP pagination by default; a limit intentionally reports `truncated: true` when more items exist. |
| Purchased Kindle ebooks | `kindle books [--limit N]` | **Experimental, fixture-verified** Ebook metadata from Manage Your Content (MYCD). Not wishlist state and not Send-to-Kindle receipts. |
| Personal Documents | `kindle pdocs [--limit N]` | **Experimental, fixture-verified** Personal Document metadata from MYCD. No document bytes, action/download URLs, CSRF, or cookies are emitted. |
| Recent Send-to-Kindle activity | `kindle recent [--limit N]` | Recent STK receipts only; this is not the complete Personal Document inventory. |

> **MYCD status — experimental / fixture-verified only.** `kindle books` and `kindle pdocs` have deterministic synthetic-fixture coverage, but have not been independently verified against an authenticated live Amazon account. Do not treat their output or pagination behavior as live-proven.

The experimental commands load the MYCD shell, extract its page-scoped CSRF token, then POST `/hz/mycd/digital-console/ajax` with `activity=GetContentOwnershipData`, `clientId=MYCD_WebService`, and the observed `activityInput` contract. They return bounded metadata (`asin` where applicable, title, author, acquisition date, document id where applicable, type) plus count/limit metadata.

## Quick start

```bash
pnpm install
pnpm build
amazon-kindle-cli auth verify
amazon-kindle-cli wishlist list --limit 100
amazon-kindle-cli kindle books --limit 100
amazon-kindle-cli kindle pdocs --limit 100
amazon-kindle-cli kindle recent --limit 25

# Send-to-Kindle is dry-run by default; execute is explicit.
amazon-kindle-cli kindle send ./book.epub --via web --execute
```

The CLI auto-loads a persisted buyer session from `~/.amazon/auth.sh`. `auth verify` proves wishlist and Send-to-Kindle surfaces independently; MYCD can additionally require a recent Amazon sign-in (`openid.pape.max_auth_age`), so `kindle books`/`pdocs` may ask for a refresh even when recent receipts work. Import a supported cookie export if needed:

```bash
amazon-kindle-cli auth import --file cookies.json
amazon-kindle-cli auth verify
```

## CLI

```text
doctor
auth status | verify [--list-id] | import --file
wishlist list [--url | --list-id] [--max-pages N] [--limit N]
wishlist add --asin ASIN | --title TITLE [--author AUTHOR] [--list-id ID] [--execute]
kindle send <files...> [--via web|email] [--execute]
kindle books [--limit N]
kindle pdocs [--limit N]
kindle recent [--limit N]
content devices
parity [--user] [--shelf]
sync goodreads-plan [--direction both]
books resolve --title|--text
add-plan --title|--text
```

## MCP tools

`AMAZON_KINDLE_MCP_PROFILE=full|core` chooses the optional tool profile. The core profile includes the read-only Kindle inventory tools.

| Tool | Risk |
|---|---|
| `amazon_kindle_wishlist_list` | read |
| `amazon_kindle_wishlist_add` | write-mutate (`execute` required) |
| `amazon_kindle_books` | read |
| `amazon_kindle_pdocs` | read |
| `amazon_kindle_recent_docs` | read |
| `amazon_kindle_send_plan` / `amazon_kindle_send` | read / write-mutate |
| `amazon_kindle_auth_status` / `_verify` / `_import` | read / read / write-safe |
| `amazon_kindle_content_devices`, `_parity`, `_goodreads_sync_plan`, `_books_resolve`, `_add_plan`, `_doctor` | read |

## HTTP contracts

- **Wishlist list:** `GET /hz/wishlist/ls/{id}` then `GET /hz/wishlist/slv/items?...paginationToken=...` until exhausted.
- **Wishlist add:** product GET for `#addToWishListForm` CSRF, then `POST /hz/wishlist/additemtolist`.
- **MYCD inventory (experimental / fixture-verified):** shell GET plus CSRF-bearing `POST /hz/mycd/digital-console/ajax` as described above; no authenticated live proof is claimed.
- **Kindle send:** `GET /sendtokindle` → init → presigned PUT → send-v2; verify separately with `kindle recent`.

See `docs/canonical-procedures.md` for exact operating recipes and `SKILL.md` for agent routing.
