@echo off
setlocal
cd /d "%~dp0"
title Dungeon Expedition

where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo Dungeon Expedition needs Node.js on this computer.
  echo Ask your school IT team to install the Node.js LTS version once,
  echo then double-click START_GAME.bat again.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Preparing the game for the first time...
  call npx --yes pnpm@11.25.0 install
  if errorlevel 1 (
    echo.
    echo Setup could not finish. Please ask your school IT team for help.
    pause
    exit /b 1
  )
)

if not exist "dist\server\wrangler.json" (
  echo Building the game...
  call npx --yes pnpm@11.25.0 build
  if errorlevel 1 (
    echo.
    echo The game could not be built. Please ask your school IT team for help.
    pause
    exit /b 1
  )
)

set "CLASSROOM_IP=localhost"
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 ^| Where-Object {$_.IPAddress -notlike '127.*' -and $_.InterfaceAlias -notmatch 'vEthernet|Loopback'} ^| Sort-Object InterfaceMetric ^| Select-Object -First 1 -ExpandProperty IPAddress)"`) do set "CLASSROOM_IP=%%i"

echo Preparing the local expedition database...
set "CI=1"
node --import ./scripts/sites-env.mjs .\node_modules\wrangler\bin\wrangler.js d1 migrations apply DB --local --persist-to .wrangler\state --config dist\server\wrangler.json
if errorlevel 1 (
  echo.
  echo The expedition database could not be prepared.
  pause
  exit /b 1
)

echo.
echo Starting Dungeon Expedition...
echo Keep this window open during the lesson.
echo Classroom address: http://%CLASSROOM_IP%:3000
echo.

start "" "http://%CLASSROOM_IP%:3000"
node --import ./scripts/sites-env.mjs .\node_modules\wrangler\bin\wrangler.js dev --config dist\server\wrangler.json --local --persist-to .wrangler\state --ip 0.0.0.0 --port 3000 --inspector-port 0

echo.
echo Dungeon Expedition has stopped.
pause
