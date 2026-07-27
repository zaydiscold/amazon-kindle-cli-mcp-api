#!/bin/sh
set -eu
umask 077
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd -P)
AUTH_FILE=${AMAZON_AUTH_FILE:-"$HOME/.amazon/auth.sh"}
if [ -f "$AUTH_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$AUTH_FILE" >/dev/null 2>&1 || true
  set +a
fi
if [ ! -f "$ROOT/mcp/dist/server.js" ]; then
  (cd "$ROOT" && corepack pnpm build) 1>&2
fi
exec "${AMAZON_KINDLE_NODE_BIN:-node}" "$ROOT/mcp/dist/server.js" "$@"
