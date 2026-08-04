# Gotchas

- Chrome ABE: use Brave CDP debug browser or Cookie-Editor import
- Email Send-to-Kindle drops unapproved senders — whitelist SMTP_FROM
- Complete Amazon credentials and OTP only interactively; never put login identifiers or secrets in documentation or command history.
- Goodreads is a **separate** cookie — bridge only
- Wishlist HTML is unstable — fixture-test parsers; prefer ASIN
- Passkey prompts steal password flows — disable WebAuthn in automation
