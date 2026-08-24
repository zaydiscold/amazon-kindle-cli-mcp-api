# Amazon Kindle CLI (MCP + API)

An unofficial, HTTP-first Amazon and Kindle CLI with an optional MCP server. It lets a human or agent work with Amazon wishlists, Send to Kindle, Kindle inventory metadata, Goodreads parity, and photo-to-book plans without making browser automation the product runtime.

The personal use case is simple: photograph a book or bookstore shelf, give the image or OCR text to an agent, resolve the exact title/edition, then build a reviewable plan for Goodreads, an Amazon wishlist, or Send to Kindle. The photo does not disappear into the camera roll.

> This project is not affiliated with Amazon, Kindle, or Goodreads. It drives unofficial web surfaces that can change. Use only with accounts and files you own or control.

## What it can do

| Need | Command | Contract |
| --- | --- | --- |
| Read an Amazon wishlist | `wishlist list` | Bounded, same-origin HTTP pagination |
| Add an exact product | `wishlist add` | Dry-run first; exact ASIN and list approval required for execution |
| Send owned files to Kindle | `kindle send` | Web upload or SMTP; exact file SHA-256 approvals required |
| Read recent Send-to-Kindle receipts | `kindle recent` | Bounded receipt metadata |
| Inspect Kindle ebook metadata | `kindle books` | Experimental MYCD surface |
| Inspect Personal Document metadata | `kindle pdocs` | Experimental MYCD surface; no document bytes/action URLs |
| Compare Amazon and Goodreads | `parity` | Requires an explicit Goodreads user id or configuration |
| Plan cross-service sync | `sync goodreads-plan` | Dry-run only |
| Turn a photo/text into actions | `books resolve` / `add-plan` | Resolves identities and emits non-executing plans |

No personal Goodreads account id is built into the package.

## Quick start

```bash
corepack pnpm install
corepack pnpm build
node cli/dist/index.js auth verify
node cli/dist/index.js wishlist list --limit 25
```

The CLI can load an owned Amazon browser session from `~/.amazon/auth.sh` or import a supported local cookie export:

```bash
node cli/dist/index.js auth import --file ./cookies.json
node cli/dist/index.js auth verify
```

Keep that file private. The MCP server’s default `read` profile does not expose local auth import or account mutations.

## Photo or bookstore workflow

Ask an agent something like:

> Read the visible book titles in this photo. Resolve the likely editions, show me the candidates, and prepare Goodreads Want to Read plus Amazon wishlist plans. Do not execute until I approve the exact IDs.

Then use the returned identifiers:

```bash
# Resolve OCR or vision output into bounded candidates/plans
node cli/dist/index.js books resolve --text "The Left Hand of Darkness by Ursula K. Le Guin"
node cli/dist/index.js add-plan --text "The Left Hand of Darkness by Ursula K. Le Guin" \
  --targets goodreads amazon

# Preview the Amazon write. The output gives the exact approval values.
node cli/dist/index.js wishlist add --asin <ASIN> --list-id <LIST_ID>

# Execute only with those exact values.
node cli/dist/index.js wishlist add --asin <ASIN> --list-id <LIST_ID> \
  --approved-asin <ASIN> --approved-list-id <LIST_ID> --execute
```

Goodreads execution is handled by the sibling `goodreads-cli-mcp-api` project, which uses the same preview, exact-approval, and readback mindset.

## Send to Kindle

A preview validates the files and emits a SHA-256 for each one:

```bash
node cli/dist/index.js kindle send ./owned-book.epub --via web
```

Use the emitted hash to bind the live action to those exact bytes:

```bash
node cli/dist/index.js kindle send ./owned-book.epub --via web \
  --approved-file-sha256 <SHA256_FROM_PREVIEW> --execute
```

The web path uses the mapped Send-to-Kindle init, presigned upload, and finalize flow. The upload destination is accepted only when it is HTTPS and belongs to an Amazon S3 host. The SMTP path remains available with `--via email`.

## MCP

Start the repository-local server through the tracked wrapper:

```bash
AMAZON_KINDLE_MCP_PROFILE=read scripts/amazon-kindle-mcp.sh
AMAZON_KINDLE_MCP_PROFILE=core scripts/amazon-kindle-mcp.sh
AMAZON_KINDLE_MCP_PROFILE=full scripts/amazon-kindle-mcp.sh
```

Profiles:

- `read` is the default and contains only observational/planning tools.
- `core` adds wishlist and Kindle send mutations while keeping the focused inventory.
- `full` preserves every existing tool, including local auth import and device probing.

Local MCP file inputs are restricted to `AMAZON_KINDLE_MCP_FILE_ROOT` unless the explicitly unsafe compatibility escape hatch `AMAZON_KINDLE_MCP_ALLOW_ARBITRARY_FILES=1` is set.

Every tool returns both compact JSON text and MCP `structuredContent`. The engine remains shared with the CLI, so execution logic is not reimplemented in the server.

## Authentication boundaries

Amazon retail and Send-to-Kindle can age differently. `auth verify` probes both:

- Wishlist reads may work publicly even when retail mutation authentication is stale.
- Send-to-Kindle may remain authenticated while a wishlist write needs a refreshed session.
- MYCD inventory can require a more recent Amazon sign-in than recent Send-to-Kindle receipts.

The tool reports those states separately rather than calling one successful page “fully authenticated.”

## Safety model

- All wishlist and Kindle mutations default to previews.
- Title search may suggest a candidate, but live wishlist execution requires an exact approved ASIN.
- A known wishlist must be approved by exact list id; the default-list lane uses the explicit `<default-list>` approval value.
- Kindle execution requires the exact SHA-256 set for the files being sent.
- User-supplied wishlist and pagination URLs must remain on `https://www.amazon.com`.
- Presigned uploads must use HTTPS Amazon S3 hosts.
- Failed responses omit raw HTML, tokens, and cookie values.
- Goodreads parity requires an explicit/configured user id. There is no repository-author fallback.

## Development

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm check
```

CI runs the supported Node 20 floor and Node 22, including audit, lint, formatting, typecheck, CLI/MCP tests, Python bridge tests, and clean builds.

The MYCD `kindle books` and `kindle pdocs` readers remain experimental and fixture-verified. Do not describe them as authenticated-live-verified until a sanitized independent receipt is added.

See `docs/canonical-procedures.md`, `DESIGN.md`, and `SKILL.md` for operating and agent details.
