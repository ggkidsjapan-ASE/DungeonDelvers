#!/bin/bash
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Dungeon Expedition needs Node.js on this Mac."
  echo "Ask your school tech person to install Node.js once, then double-click this file again."
  read -r -p "Press Return to close."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Preparing the game for the first time…"
  corepack pnpm install || {
    echo "Setup could not finish. Ask your school tech person for help."
    read -r -p "Press Return to close."
    exit 1
  }
fi

if [ ! -f dist/server/wrangler.json ]; then
  echo "Building the game…"
  corepack pnpm build || exit 1
fi

CLASSROOM_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
if [ -z "$CLASSROOM_IP" ]; then CLASSROOM_IP="localhost"; fi

echo "Preparing the local expedition database..."
CI=1 node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 migrations apply DB --local --persist-to .wrangler/state --config dist/server/wrangler.json || {
  echo "The expedition database could not be prepared."
  read -r -p "Press Return to close."
  exit 1
}

echo "Starting Dungeon Expedition at http://$CLASSROOM_IP:3000"
(sleep 3; open "http://$CLASSROOM_IP:3000") &
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js dev --config dist/server/wrangler.json --local --persist-to .wrangler/state --ip 0.0.0.0 --port 3000 --inspector-port 0
