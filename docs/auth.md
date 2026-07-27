# Auth

## Two independent credential surfaces

| Surface | Env | How |
|---|---|---|
| Amazon buyer web | `AMAZON_COOKIE` | Browser session |
| Send to Kindle | `KINDLE_EMAIL` + SMTP | Email path |

Chrome **App-Bound Encryption** blocks silent cookie-DB decrypt. Supported paths:

1. **Brave CDP debug profile** (preferred for agents)  
   Port `9333`, profile `%LOCALAPPDATA%\amazon-kindle-debug-profile`  
   Login helper dumps `~/.amazon/auth.sh`
2. **Cookie-Editor export** → `amazon-kindle-cli auth import --file …`
3. **Manual** `export AMAZON_COOKIE='…'`

Never commit auth files.
