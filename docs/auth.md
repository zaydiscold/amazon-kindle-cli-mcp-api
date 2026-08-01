# Auth

## Two independent credential surfaces

| Surface | Env | How |
|---|---|---|
| Amazon buyer web + Send-to-Kindle web | `AMAZON_COOKIE` | Persisted browser session; CLI auto-loads `~/.amazon/auth.sh` |
| Send to Kindle email fallback | `KINDLE_EMAIL` + SMTP | Independent email path |

Chrome **App-Bound Encryption** blocks silent cookie-DB decrypt. Supported paths:

1. **Brave CDP debug profile** (preferred for agents)  
   Port `9333`, profile `%LOCALAPPDATA%\amazon-kindle-debug-profile`  
   Login helper dumps `~/.amazon/auth.sh`
2. **Cookie-Editor export** → `amazon-kindle-cli auth import --file …`
3. **Manual** `export AMAZON_COOKIE='…'`

The standalone CLI automatically loads `~/.amazon/auth.sh`. Humans, cron jobs, and scripts do not need to `source` it and do not need an MCP server running.

```bash
amazon-kindle-cli auth status   # presence and cookie-name metadata only
amazon-kindle-cli auth verify   # live retail wishlist + Kindle HTTP proof
```

`auth status` is not authentication proof. `auth verify` checks both HTTP surfaces and reports them independently. Amazon may enforce `openid.pape.max_auth_age=900` for authenticated wishlist operations; when that retail session is stale, public wishlist reads automatically retry without cookies while writes remain blocked until recent authentication is captured. Inspect `readReady`, `retailWriteReady`, and `kindleAuthenticated` separately.

Never commit auth files.
