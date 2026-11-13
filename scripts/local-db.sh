#!/usr/bin/env bash
# Development Postgres, without Docker: uses the one from the flake and keeps
# its data in backend/.pgdata/ (outside git). Deleting that folder resets it.
#
#   scripts/local-db.sh         starts it (the first time it also creates it)
#   scripts/local-db.sh stop    stops it
#
# User, password, database and port match DATABASE_URL in
# secrets/dev.enc.yaml. Run it inside the Nix environment.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA="$ROOT/backend/.pgdata"
PORT=5432
DB_USER=parade
DB_PASSWORD=parade
DB_NAME=parade

if ! command -v pg_ctl >/dev/null; then
  echo "pg_ctl not found: run this inside \`nix develop\` (or with direnv)." >&2
  exit 1
fi

is_running() {
  pg_ctl -D "$DATA" status >/dev/null 2>&1
}

if [ "${1:-}" = "stop" ]; then
  if [ -d "$DATA" ] && is_running; then
    pg_ctl -D "$DATA" stop --mode fast
  else
    echo "Local Postgres was already stopped."
  fi
  exit 0
fi

if [ ! -d "$DATA" ]; then
  echo "Creating the local database in backend/.pgdata/ ..."
  initdb -D "$DATA" --username postgres --auth-local trust --auth-host scram-sha-256 \
    --encoding UTF8 --locale C.UTF-8 >/dev/null
fi

if is_running; then
  echo "Local Postgres was already running."
else
  # The socket goes in the data folder: /run/postgresql does not exist
  # unless Postgres is installed system-wide.
  pg_ctl -D "$DATA" -l "$DATA/postgres.log" --wait start \
    -o "-p $PORT -c listen_addresses=localhost -c unix_socket_directories='$DATA'" >/dev/null
fi

sql() {
  psql --host "$DATA" --port "$PORT" --username postgres --quiet --tuples-only --no-align "$@"
}

if [ -z "$(sql postgres -c "SELECT 1 FROM pg_roles WHERE rolname = '$DB_USER'")" ]; then
  sql postgres -c "CREATE ROLE $DB_USER LOGIN PASSWORD '$DB_PASSWORD'"
fi
if [ -z "$(sql postgres -c "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'")" ]; then
  sql postgres -c "CREATE DATABASE $DB_NAME OWNER $DB_USER"
fi

echo "Local Postgres ready: postgresql://$DB_USER:$DB_PASSWORD@localhost:$PORT/$DB_NAME"
