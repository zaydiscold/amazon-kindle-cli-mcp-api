# Amazon / Kindle CLI (MCP + API) — design sketch

Sibling to `goodreads-cli-mcp-api`. **Do not fold Amazon auth into Goodreads.**
Same Amazon account owns shopping + Kindle, but Goodreads is a separate cookie
surface (often Amazon-SSO linked). Two logins in the browser can share one human;
two CLIs should still keep two credential files.

## Why separate

| Surface | Cookie host | What we want |
|---|---|---|
| Goodreads | `goodreads.com` | Want-to-read, notes publicize, quotes |
| Amazon retail | `amazon.com` | Wish lists, "Save for later", cart |
| Kindle / content | `amazon.com` + Send to Kindle | Library docs, email/upload delivery |

Reviews can look unified in the UI; sessions and write paths are not.

## Repo shape (Printing Press / Goodreads lineage)

```
amazon-kindle-cli-mcp-api/
  api-map/          OpenAPI + markdown for mapped routes
  cli/              engine + commands
  mcp/              thin MCP adapters
  docs/auth.md      AMAZON_COOKIE vs KINDLE_SEND_EMAIL
  SKILL.md
```

Auth files (chmod 600, never committed):

```bash
~/.amazon/auth.sh          # AMAZON_COOKIE (+ CSRF if needed)
~/.kindle/send.env         # KINDLE_SEND_ADDRESS, APPROVED_FROM, SMTP_*
```

## Phase 1 — Send to Kindle (highest leverage, ships first)

You already drop EPUBs on Desktop (`A_Parade_of_Horribles_-_Matt_Dinniman.epub`).

**Primary path: email** (stable, no upload UI thrash)

1. One-time: Amazon → Manage Your Content and Devices → Preferences →
   Personal Document Settings → copy Send-to-Kindle address + approve sender.
2. CLI: `kindle send ./book.epub` / MCP `kindle_send` with path or URL download.
3. Formats: EPUB, PDF, DOC/DOCX, TXT, RTF, HTML, images (Amazon limits apply;
   ~200 MB web / ~50 MB email attachment rules — zip if needed).
4. Verify: Content & Devices personal documents list (read later).

**Secondary path:** browser/CDP `sendtokindle` web upload when email is blocked.

Agent loop already possible today without a full CLI:

```text
find/download epub → SMTP attach → kindle@... → appears in Kindle app
```

The CLI just makes that durable + MCP-callable.

## Phase 2 — Amazon list → Goodreads Want to Read

1. `amazon wishlist export` (cookie session or public list id scrape).
2. Normalize titles/authors/ASINs/ISBNs to a JSON inventory.
3. For each missing title: resolve Goodreads `book_id` →
   `goodreads-cli shelves add --name to-read --execute`
   (already live on Goodreads PR #8).
4. Diff report: only-on-Amazon / only-on-Goodreads / both.

Kindle "want to read" / Goodreads want-to-read / Amazon wishlist are **three
lists**. Sync target of record for reading backlog = **Goodreads `to-read`**
unless you decide otherwise.

## Phase 3 — parity tools (later)

- Kindle library inventory (owned docs vs purchased)
- Remove / archive personal docs
- Optional Calibre-web or local library bridge

## Explicit non-goals (v1)

- Buying books / one-click purchase automation
- Circumventing DRM on purchased Kindle books
- Stuffing Amazon cookies into `goodreads-cli`

## Open setup you need once

1. Send-to-Kindle email address
2. Approved from-address + SMTP (or Hermes/local mailer)
3. Logged-in Amazon Chrome session for wishlist scrape (cookie extract like Goodreads)

## Relationship to Goodreads

```
[photos / Amazon wishlist / EPUB]
        │
        ▼
 amazon-kindle-cli ──send──▶ Kindle app library
        │
        └──export titles──▶ goodreads-cli shelves add (to-read)
```

Goodreads stays the social/notes/backlog brain. Kindle stays the reading device.
Amazon wishlist is an intake hopper.
