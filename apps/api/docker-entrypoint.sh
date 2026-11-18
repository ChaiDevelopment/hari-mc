#!/bin/sh
# Entrypoint container API: terapkan migration database lalu jalankan server.
# RUN_MIGRATIONS=false untuk melewati migration (mis. bila dijalankan terpisah di pipeline).
set -e

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "[entrypoint] prisma migrate deploy"
  ./node_modules/.bin/prisma migrate deploy
fi

echo "[entrypoint] starting API on port ${PORT:-4100}"
exec node dist/main.js
