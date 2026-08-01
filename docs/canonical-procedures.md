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
| verify Kindle conversion | `kindle recent` | no |

## HTTP contracts (mapped)

### Wishlist list
1. `GET /hz/wishlist/ls/{listId}?sort=date-added&viewType=list`
2. Parse items + `showMoreUrl`
3. Loop `GET /hz/wishlist/slv/items?filter=…&paginationToken=…` until exhausted

### Wishlist add
1. `GET /dp/{ASIN}` → `anti-csrftoken-a2z` from `#addToWishListForm`
2. `POST /hz/wishlist/additemtolist?ie=UTF8`  
   body: `asin`, `vendorId=website.wishlist.detail.add`, `listType=wishlist`, `isAjax=1`, optional `listId`

### Kindle send (web)
1. `GET /sendtokindle` → CSRF  
2. `POST /sendtokindle/init` → uploadUrl  
3. `PUT uploadUrl` bytes  
4. `POST /sendtokindle/send-v2`  
5. `GET /sendtokindle/recent-docs` receipt  

Email path: SMTP → `KINDLE_EMAIL` (independent of buyer cookie).

## Auth

```bash
source ~/.amazon/auth.sh   # AMAZON_COOKIE + optional AMAZON_WISHLIST_ID
amazon-kindle-cli doctor
amazon-kindle-cli auth status
# refresh: Cookie-Editor / portable JSON → auth import --file …
```

CDP/Brave is **only** for minting a fresh cookie when session dies — not for wishlist/kindle product flows.

## Cross-surface matching

`ASIN exact → Goodreads id exact → normalized title + author last name`.

Never silently add a fuzzy match.

## Inspiration / hub

Same CLI mesh pattern as Printing Press + goodreads-cli: api-map first, dry-run default, CLI↔MCP parity, JSON envelopes.
