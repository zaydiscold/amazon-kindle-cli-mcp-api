# Write operations

## kindle send
Dry-run by default. `--execute` sends via SMTP to `KINDLE_EMAIL`.

Amazon converts asynchronously. `mutationVerified` stays false until on-device confirm.

## auth import
Local-only credential write. Not a remote mutation.
