# AGENTS.md — amazon-kindle-cli

This file is for developing and maintaining the repo. For ordinary actions such as sending a legal EPUB/PDF to Kindle, adding a title to an Amazon wishlist, or routing a title to Goodreads, read [`SKILL.md`](./SKILL.md) first and use its zero-thought intent router. Do not explore the codebase or launch browser tooling when the CLI path already exists.

## Invariants
1. One engine, CLI↔MCP parity — logic in `cli/src/engine.ts`
2. Reads free, writes gate — dry-run default; `--execute` opt-in
3. Kindle-first — Send-to-Kindle is the hero path
4. Never print secrets
5. Redaction-first wishlist output

## Build
```bash
pnpm install && pnpm build && pnpm test
```

## Auth for agents
- Preferred: Brave CDP `:9333` profile `amazon-kindle-debug-profile` → dump `~/.amazon/auth.sh`
- Fallback: Cookie-Editor JSON → `auth import`
- Never claim silent Chrome cookie DB decrypt works on modern ABE Chrome

## Bookstore photos + Goodreads parity
- Photo haul → resolve ASIN → `wishlist add --execute` is a live path.
- Sibling https://github.com/zaydiscold/goodreads-cli-mcp-api : `shelves add --name to-read --execute`.
- Bridge: `parity`, `sync goodreads-plan` (dry-run map). Execute shelves on Goodreads CLI.
- Runtime truth is `node cli/dist/index.js --help`; do not preserve stale PR numbers or command lists here.

## Goodreads bridge
`sync goodreads-plan` only. Execute shelf adds via goodreads-cli MCP with separate cookie.

## Recent regression guards

### Retail auth is not Kindle auth

A readable Kindle/content session does not prove retail wishlist writes are authorized. Amazon may serve Kindle content while retail writes redirect through `openid.pape.max_auth_age`, sign-in, or reauthentication.

- Keep authenticated read state/`readReady` separate from `retailWriteReady`.
- Never infer retail-write readiness from cookie presence, Kindle status, or HTTP 200.
- Wishlist listing must return parsed private items. Wishlist-add verification must be a dry-run with the intended route and `submitted=false` unless a live write was expressly approved.
- Retail wishlist calls need retail-scoped cookies, browser-compatible headers, and the route-specific wishlist CSRF token; generic anti-CSRF values are not substitutes.
- `format:check` is the canonical non-mutating formatting gate. Do not use broad formatting changes to conceal behavior changes.

Focused, non-duplicative gate after auth verification, cookie harvesting, wishlist list/add, CSRF, or adapter changes:

```bash
pnpm regression:recent
```

This reuses the existing auth-verification, wishlist, Python-helper, and formatting tests. Before release, also run full build/typecheck/lint/test and the external live ship gate. Signed-out HTML, redirect loops, WAF pages, and opaque `fetch failed` results are failures.
