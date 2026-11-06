@echo off
setlocal
cd /d "%~dp0"
title Dungeon Delvers - Setup and Deploy

where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo Node.js 22.13 or newer is required.
  echo Install the LTS version from https://nodejs.org, then run this file again.
  echo.
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo npm was not found. Reinstall Node.js with npm included, then try again.
  pause
  exit /b 1
)

node -e "const [major, minor] = process.versions.node.split('.').map(Number); if (major < 22 || (major === 22 && minor < 13)) process.exit(1)"
if errorlevel 1 (
  echo Node.js 22.13 or newer is required. Update Node.js, then run this file again.
  pause
  exit /b 1
)

echo.
echo Installing project dependencies. This may take several minutes...
call npx --yes pnpm@11.25.0 install
if errorlevel 1 (
  echo.
  echo Dependency installation failed. Check your internet connection and try again.
  pause
  exit /b 1
)

echo.
echo Checking Cloudflare login...
node .\node_modules\wrangler\bin\wrangler.js whoami
if errorlevel 1 (
  echo.
  echo A Cloudflare browser login will open. Sign in to the account that owns
  echo the existing Dungeon Delvers Worker, then return to this window.
  node .\node_modules\wrangler\bin\wrangler.js login
  if errorlevel 1 (
    echo.
    echo Cloudflare login did not complete.
    pause
    exit /b 1
  )
)

echo.
echo Building and deploying Dungeon Delvers to Cloudflare...
call npx --yes pnpm@11.25.0 deploy:cloudflare
if errorlevel 1 (
  echo.
  echo Deployment failed. Read the error above, resolve it, then run this file again.
  pause
  exit /b 1
)

echo.
echo Deployment complete.
echo https://dungeon-divers.ggkids-japan-428.workers.dev
echo.
pause
