# Amazon/Kindle CLI — Canonical Working Procedures

**Rule: product paths are HTTP/scriptable only.** Browser/CDP is for **auth capture + API mapping**, never runtime scroll/click automation.

## Book mesh

| Intent | Command / tool | Remote write? |
|---|---|---|
| inspect Amazon reading queue | `wishlist list --list-id …` | no (HTTP + slv pagination) |
| inspect Goodreads to-read | Goodreads CLI / RSS | no |
| diff queues | `parity --user 179929687` | no |
| plan both-way reconciliation | `sync goodreads-plan --direction both` | no |
| photo/title → multi-surface routing | `books resolve` / `add-plan` | no |
| add resolved book to Amazon list | `wishlist add --asin … --execute` | yes, HTTP |
| add to Goodreads | goodreads-cli `shelves add` | yes, execute-gated |
| put EPUB/PDF on Kindle | `kindle send … --via web\|email --execute` | yes, execute-gated |
| inspect purchased Kindle Ebook inventory | `kindle books [--limit N]` | no — MYCD ownership metadata, not wishlist state |
| inspect Personal Document inventory | `kindle pdocs [--limit N]` | no — MYCD ownership metadata, not document bytes or recent receipts |
| inspect recent Send-to-Kindle activity | `kindle recent [--limit N]` | no — receipt list only; not a complete Personal Document inventory |

## HTTP contracts (mapped)

### Wishlist list
1. `GET /hz/wishlist/ls/{listId}?sort=date-added&viewType=list`
2. Parse items + `showMoreUrl`
3. Loop `GET /hz/wishlist/slv/items?filter=…&paginationToken=…` until exhausted

### Wishlist add
1. `GET /dp/{ASIN}` → `anti-csrftoken-a2z` from `#addToWishListForm`
2. `POST /hz/wishlist/additemtolist?ie=UTF8`  
   body: `asin`, `vendorId=website.wishlist.detail.add`, `listType=wishlist`, `isAjax=1`, optional `listId`

### Kindle inventory (MYCD, experimental / fixture-verified only)
> No authenticated account-backed live verification is claimed for these routes. The HTTP contract and pagination behavior are covered by synthetic fixtures; treat output as experimental until a user explicitly authorizes bounded read-only proof.

1. `GET /hz/mycd/digital-console/contentlist/booksAll/dateDsc/` or `.../pdocs/dateDsc/` → page-scoped `csrfToken`
2. `POST /hz/mycd/digital-console/ajax` form body: `activity=GetContentOwnershipData`, `clientId=MYCD_WebService`, `csrfToken`, and JSON `activityInput`
3. `kindle books` requests `booksAll` / `Ebook`; `kindle pdocs` requests `pdocs` / `KindlePDoc`; follow bounded batches until exhausted or `--limit`

Returned metadata excludes CSRF, cookies, presigned/download/action URLs, and private document content. `kindle recent` remains a Send-to-Kindle receipt list, not an inventory substitute. MYCD may separately require a recent Amazon sign-in (`openid.pape.max_auth_age`, observed 3600 seconds); `auth verify` proves retail + Send-to-Kindle only, so refresh persisted auth when MYCD redirects to sign-in.

### Kindle send (web)
1. `GET /sendtokindle` → CSRF  
2. `POST /sendtokindle/init` → uploadUrl  
3. `PUT uploadUrl` bytes  
4. `POST /sendtokindle/send-v2`  
5. `GET /sendtokindle/recent-docs` receipt  

Email path: SMTP → `KINDLE_EMAIL` (independent of buyer cookie).

## Auth

```bash
amazon-kindle-cli auth status
amazon-kindle-cli auth verify   # auto-loads ~/.amazon/auth.sh; proves retail + Kindle
# refresh: Cookie-Editor / portable JSON → auth import --file …
```

CDP/Brave is **only** for minting a fresh cookie when session dies — not for wishlist/kindle product flows.

## Cross-surface matching

`ASIN exact → Goodreads id exact → normalized title + author last name`.

Never silently add a fuzzy match.

## Inspiration / hub

Same CLI mesh pattern as Printing Press + goodreads-cli: api-map first, dry-run default, CLI↔MCP parity, JSON envelopes.
