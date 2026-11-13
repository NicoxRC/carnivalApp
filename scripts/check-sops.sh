#!/usr/bin/env bash
# pre-commit hook: nothing enters secrets/ in plain text.
#
# sops adds a top-level `sops` key to every file it encrypts. If a file in
# secrets/ does not have it, it is not encrypted and the commit is rejected.
#
# Usage: scripts/check-sops.sh <file>...
set -euo pipefail

unencrypted=0

for file in "$@"; do
  # YAML (`sops:`), JSON (`"sops":`) or dotenv (`sops_version=`).
  if ! grep -qE '^(sops:|[[:space:]]*"sops":|sops_version=)' "$file"; then
    echo "Not encrypted: $file" >&2
    unencrypted=1
  fi
done

if [ "$unencrypted" -ne 0 ]; then
  echo "Encrypt it with \`sops --encrypt --in-place <file>\` before committing." >&2
  exit 1
fi
