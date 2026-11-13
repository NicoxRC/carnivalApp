#!/usr/bin/env bash
# Hook de pre-commit: nada entra a secrets/ en texto plano.
#
# sops agrega una clave `sops` de primer nivel a todo archivo que cifra. Si un
# archivo de secrets/ no la tiene, no está cifrado y el commit se rechaza.
#
# Uso: scripts/verificar-sops.sh <archivo>...
set -euo pipefail

sin_cifrar=0

for archivo in "$@"; do
  # YAML (`sops:`), JSON (`"sops":`) o dotenv (`sops_version=`).
  if ! grep -qE '^(sops:|[[:space:]]*"sops":|sops_version=)' "$archivo"; then
    echo "Sin cifrar: $archivo" >&2
    sin_cifrar=1
  fi
done

if [ "$sin_cifrar" -ne 0 ]; then
  echo "Cífralo con \`sops --encrypt --in-place <archivo>\` antes de hacer commit." >&2
  exit 1
fi
