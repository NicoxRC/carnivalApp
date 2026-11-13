#!/usr/bin/env bash
# Postgres de desarrollo, sin Docker: usa el del flake y guarda los datos en
# backend/.pgdata/ (fuera de git). Borrar esa carpeta lo deja como nuevo.
#
#   scripts/db-local.sh          enciende (la primera vez también lo crea)
#   scripts/db-local.sh parar    apaga
#
# Usuario, clave, base y puerto coinciden con DATABASE_URL de
# secrets/dev.enc.yaml. Se corre dentro del entorno de Nix.
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATOS="$RAIZ/backend/.pgdata"
PUERTO=5432
USUARIO=desfile
CLAVE=desfile
BASE=desfile

if ! command -v pg_ctl >/dev/null; then
  echo "No encuentro pg_ctl: corre esto dentro de \`nix develop\` (o con direnv)." >&2
  exit 1
fi

encendido() {
  pg_ctl -D "$DATOS" status >/dev/null 2>&1
}

if [ "${1:-}" = "parar" ]; then
  if [ -d "$DATOS" ] && encendido; then
    pg_ctl -D "$DATOS" stop --mode fast
  else
    echo "Postgres local ya estaba apagado."
  fi
  exit 0
fi

if [ ! -d "$DATOS" ]; then
  echo "Creando la base local en backend/.pgdata/ ..."
  initdb -D "$DATOS" --username postgres --auth-local trust --auth-host scram-sha-256 \
    --encoding UTF8 --locale C.UTF-8 >/dev/null
fi

if encendido; then
  echo "Postgres local ya estaba encendido."
else
  # El socket va en la carpeta de datos: /run/postgresql no existe sin
  # instalar Postgres en el sistema.
  pg_ctl -D "$DATOS" -l "$DATOS/postgres.log" --wait start \
    -o "-p $PUERTO -c listen_addresses=localhost -c unix_socket_directories='$DATOS'" >/dev/null
fi

sql() {
  psql --host "$DATOS" --port "$PUERTO" --username postgres --quiet --tuples-only --no-align "$@"
}

if [ -z "$(sql postgres -c "SELECT 1 FROM pg_roles WHERE rolname = '$USUARIO'")" ]; then
  sql postgres -c "CREATE ROLE $USUARIO LOGIN PASSWORD '$CLAVE'"
fi
if [ -z "$(sql postgres -c "SELECT 1 FROM pg_database WHERE datname = '$BASE'")" ]; then
  sql postgres -c "CREATE DATABASE $BASE OWNER $USUARIO"
fi

echo "Postgres local listo: postgresql://$USUARIO:$CLAVE@localhost:$PUERTO/$BASE"
