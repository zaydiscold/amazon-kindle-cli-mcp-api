# Book Mesh — Amazon ⇄ Kindle ⇄ Goodreads

The system has **three book surfaces** and one ingest surface:

```text
photo / title / EPUB
       │
       ├── Amazon Wishlist       (what to buy/read)
       ├── Goodreads to-read     (reading intent + social/library record)
       └── Kindle personal docs  (what is actually on a device)
```

## Current proven paths

| Path | State | Proof |
|---|---|---|
| Amazon Wishlist → CLI | live | signed-in cookie + parsed Shopping List |
| Goodreads to-read → RSS | live | user `179929687`, 100-item RSS page |
| Amazon ⇄ Goodreads parity | live | title/author normalized diff |
| EPUB → Kindle web upload | live | `A_Parade_of_Horribles_-_Matt_Dinniman.epub`; init → signed PUT → send-v2 returned `status:true`; recent docs showed `IN_PROGRESS` |
| EPUB → Kindle email | ready | needs SMTP config + approved sender |
| photo/text → add plan | ready | `books resolve` creates Amazon search + Goodreads resolved-id plan |

## Commands

```bash
# What differs between Amazon Shopping List and Goodreads Want to Read?
amazon-kindle-cli parity --user 179929687 --shelf to-read

# Dry-run actions both directions
amazon-kindle-cli sync goodreads-plan --direction both

# Resolve a photo/vision OCR text into all destinations
amazon-kindle-cli books resolve --text $'Dungeon Crawler Carl\nby Matt Dinniman'
amazon-kindle-cli add-plan --title 'Dungeon Crawler Carl' --author 'Matt Dinniman'

# Kindle: preferred web upload, dry-run then live
amazon-kindle-cli kindle send ./book.epub --via web
amazon-kindle-cli kindle send ./book.epub --via web --execute

# Confirm async conversion/delivery
amazon-kindle-cli kindle recent
```

## Matching contract

1. exact ASIN always wins
2. exact Goodreads id always wins
3. otherwise match normalized title + author last-name
4. all non-exact matches remain **plans**; never silently mutate a shelf/list

## Mutation gates

- Goodreads: `goodreads-cli shelves add --book-id <id> --name to-read --execute`
- Kindle web: `kindle send <file> --via web --execute`
- Amazon add-to-list: browser path until its mutation request has an independent live proof

## Kindle addresses discovered

Manage Your Content exposes four `@kindle.com` addresses. They are stored locally in `~/.amazon/config.json`; do not expose them in public docs or commit them.
