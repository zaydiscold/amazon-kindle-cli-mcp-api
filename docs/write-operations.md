# Write operations

## kindle send
Dry-run by default. `--execute` sends through the selected transport:

- `--via web` (default): pure HTTP `sendtokindle` init → upload → `send-v2`
- `--via email`: SMTP to `KINDLE_EMAIL`

Amazon converts asynchronously. `mutationVerified` stays false until the recent-docs response or device/app confirms delivery.

## auth import
Local-only credential write. Not a remote mutation.
