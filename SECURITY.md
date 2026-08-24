# Security Policy

## Sensitive data

Never commit or paste into issues, pull requests, logs, or public proofs:

- `AMAZON_COOKIE` / `AMAZON_COOKIES`
- Amazon retail or Kindle CSRF tokens
- presigned Send-to-Kindle upload URLs or tokens
- SMTP passwords
- Kindle delivery addresses
- private Goodreads RSS keys
- authenticated raw HTML captures
- document bytes, highlight text, message bodies, or private account URLs

Use sanitized structural fixtures and bounded metadata receipts instead.

## Supported release

Security fixes target the current default branch. The project uses unofficial Amazon, Kindle, and Goodreads web surfaces, so a route working today is not a stability guarantee.

## Reporting

Report a suspected vulnerability privately to the repository owner before opening a public issue. Include:

- affected command or MCP tool
- whether a network request or account mutation occurred
- a redacted reproduction
- the expected trust boundary

Do not include credentials, response bodies, presigned URLs, owned document content, or account identifiers.

## Runtime boundaries

- Amazon retail requests are restricted to exact HTTPS `www.amazon.com`.
- Send-to-Kindle presigned uploads are accepted only on HTTPS Amazon S3 hosts.
- MCP local-file access is restricted to `AMAZON_KINDLE_MCP_FILE_ROOT` unless an explicit unsafe compatibility override is enabled.
- Account mutations default to dry-run and require exact approvals.
- The default MCP profile is read-only.
