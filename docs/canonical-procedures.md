# Amazon/KIndle CLI — Canonical Working Procedures

## Book mesh

| Intent | Command / tool | Remote write? |
|---|---|---|
| inspect Amazon reading queue | `wishlist list` | no |
| inspect Goodreads to-read | `parity` / RSS | no |
| diff queues | `parity --user 179929687` | no |
| plan both-way reconciliation | `sync goodreads-plan --direction both` | no |
| photo/title → multi-surface routing | `books resolve` / `add-plan` | no |
| add a resolved book to Amazon list | `wishlist add --asin … --execute` | yes, browser-gated |
| add to Goodreads | `goodreads_shelf_add` / Goodreads CLI | yes, execute-gated |
| put an EPUB/PDF on Kindle | `kindle send … --via web|browser|email --execute` | yes, execute-gated |
| verify Kindle conversion | `kindle recent` | no |

## Three redundant Kindle delivery paths

1. **browser** — Brave CDP drives Amazon UI; default, independently proven
2. **web** — direct HTTP: `init → signed PUT → send-v2`; mapped from live network traffic, alternate path
3. **email** — approved SMTP sender → device address; independent of Amazon buyer cookie

Default is `browser`; use `web` when its direct executor is desired. All three default to dry-run.

## File proof

`C:\Users\ZaydK\Desktop\A_Parade_of_Horribles_-_Matt_Dinniman.epub`

- 2,891,674 bytes
- browser uploader reached Ready to Send
- Send-to-Kindle `send-v2` accepted
- `kindle recent` verified state `IN_LIBRARY`

## Cross-surface matching

`ASIN exact → Goodreads id exact → normalized title + author last name`.

Never silently add a fuzzy match. A non-exact candidate is an add plan only.

## Photo intake

The vision agent should pass visible title/author OCR to:

```text
amazon_kindle_books_resolve { text: "title\nby author" }
amazon_kindle_add_plan { title, author }
```

Then execute target-specific mutations only after resolution.

## Amazon orders methodology adopted

- portable auth JSON `{cookies: "…"}` ↔ `amazon-orders-pp-cli auth import`
- agent JSON envelopes, dry-runs, profiles/receipts mentality
- local/offline state is an optional orders concern, not mixed into Kindle core
- strong source/provenance: `recent-docs` is the actual delivery receipt
