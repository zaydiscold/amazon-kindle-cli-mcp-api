# AGENTS.md — amazon-kindle-cli

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

## Goodreads bridge
`sync goodreads-plan` only. Execute shelf adds via goodreads-cli MCP with separate cookie.
