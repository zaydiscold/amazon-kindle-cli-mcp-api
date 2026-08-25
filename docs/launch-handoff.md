# Amazon Kindle CLI launch handoff

This file is for the final operator or coding agent with repository-settings access. Do not redesign working interfaces during this handoff.

## Product decision

This is the sibling tool to Goodreads CLI, not a second feature inside the Goodreads repository.

Recommended public identity:

- Repository name: `kindle-cli` if available
- Fallback name: `amazon-kindle-cli`
- Description: `Unofficial Kindle and Amazon reading CLI for wishlists, Send to Kindle, library metadata, and Goodreads parity. Optional MCP support.`
- Runtime version: `0.3.0`

## Compatibility rules

Preserve all existing:

1. CLI commands and subcommands.
2. Engine capability keys and package exports.
3. Sixteen legacy MCP tool names.
4. `full` and `core` MCP profiles.
5. The safer `read` MCP profile.
6. HTTP-first product paths and browser-only authentication capture.
7. Exact ASIN, wishlist, and file-hash approval gates.
8. Bounded response and fixture handling.
9. Node 20 and Node 22 support.

Never remove or silently rename a working command. Add compatibility aliases when a future naming improvement is necessary.

## Canonical pull request

There must be one launch PR targeting the current default branch. The canonical branch is `release/twitter-ready-20260824`.

Before merge, verify:

```bash
pnpm install --frozen-lockfile
pnpm audit:security
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

Do not merge a self-modifying CI workflow. CI must validate source, not rewrite and push source back to the PR branch.

## After merge

1. Confirm the canonical launch PR is merged.
2. Re-run CI on the default branch.
3. Create `main` at the merged commit.
4. Change the GitHub default branch from `master` to `main`.
5. Update branch protection and CI push filters from `master` to `main`.
6. Delete `master` only after the new default branch and protections are confirmed.
7. Delete these stale branches after confirming they have no open PR:
   - `release/twitter-ready-20260824`
   - `feat/api-first-defaults`
   - `feat/http-only-wishlist-list`
8. Leave only `main` unless a genuinely active follow-up branch exists.

Do not force-push the new default branch.

## Repository rename and links

After `main` is green:

1. Rename the repository to `kindle-cli`, or `amazon-kindle-cli` if the shorter name is unavailable.
2. Set topics:
   `kindle`, `amazon`, `cli`, `books`, `reading`, `send-to-kindle`, `automation`, `mcp`, `typescript`
3. Update the sibling link to the final Goodreads repository:
   `https://github.com/zaydiscold/goodreads-cli`
4. Update links in both READMEs, package metadata, profile pages, websites, and launch posts.
5. GitHub redirects the old URL, but publish only the canonical new URL.

## Release

- Keep npm publication disabled until packed tarballs are inspected outside the workspace.
- Create tag `v0.3.0` only after CI passes on the renamed repository and `main`.
- Release title: `Kindle CLI v0.3.0`.
- Do not claim the experimental MYCD inventory as authenticated-live verified unless a new sanitized proof actually establishes that.

## Launch placement

The Goodreads project is the primary launch post. Put this project in the first reply or in a later quote-post.

Use a reply when it is supporting context:

```text
I built the other half too: a Kindle/Amazon CLI for wishlists, Send to Kindle, library metadata, and Goodreads parity.

https://github.com/zaydiscold/kindle-cli
```

Use a later quote-post only when the Goodreads post has earned enough engagement to justify a separate second hook. Do not post both links in the first Goodreads post.

## Final operator report

Leave one final comment on the canonical PR with:

- final repository name and URL;
- final default branch;
- merged PR number;
- tag and release URL;
- Node 20 and Node 22 CI links;
- CLI help inventory;
- MCP `tools/list` counts for `read`, `core`, and `full`;
- confirmation that no live account mutation was used for release verification;
- confirmation that stale branches were deleted.
