@echo off
setlocal
if defined AMAZON_AUTH_FILE (set "AUTH_FILE=%AMAZON_AUTH_FILE%") else (set "AUTH_FILE=%USERPROFILE%\.amazon\auth.bat")
if exist "%AUTH_FILE%" call "%AUTH_FILE%" >nul 2>&1
set "ROOT=%~dp0.."
if not exist "%ROOT%\mcp\dist\server.js" (
  pushd "%ROOT%"
  call corepack pnpm build 1>&2
  popd
)
node "%ROOT%\mcp\dist\server.js" %*
