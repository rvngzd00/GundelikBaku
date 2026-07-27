#!/bin/sh
set -eu
node backend/dist/db/migrate.js
node backend/dist/db/seed.js
exec node backend/dist/server.js
