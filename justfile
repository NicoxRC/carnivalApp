# Project commands. Run `just` to list them.
#
# They need the Nix environment (`nix develop`, or direnv) and, for anything
# that reads secrets, your age key in ~/.config/sops/age/keys.txt.

set shell := ["bash", "-euo", "pipefail", "-c"]

dev_secrets := "secrets/dev.enc.yaml"
# The throwaway Postgres of docker-compose.yml. Not a secret: it lives in
# memory and only on this machine.
test_database_url := "postgresql+asyncpg://parade:parade@localhost:5433/parade_test"

# List the commands
default:
    @just --list --unsorted

# Start everything the backend needs and run it on http://localhost:8000
dev: migrate
    sops exec-env {{ dev_secrets }} 'cd backend && uv run fastapi dev'

# Start the local Postgres (the first time it also creates it)
db:
    scripts/local-db.sh

# Stop the local Postgres
db-stop:
    scripts/local-db.sh stop

# Apply pending migrations to the local database
migrate: db
    sops exec-env {{ dev_secrets }} 'cd backend && uv run alembic upgrade head'

# Run the backend tests; extra arguments go to pytest
test *args:
    cd backend && uv run pytest {{ args }}

# Run every pre-commit hook on the whole repo
check:
    pre-commit run --all-files

# Edit the development secrets (decrypts, opens $EDITOR, encrypts on save)
secrets:
    sops {{ dev_secrets }}

# Check the migrations against a throwaway Postgres in Docker
db-test:
    #!/usr/bin/env bash
    set -euo pipefail
    docker compose up --detach --wait db-test
    trap 'docker compose down --volumes' EXIT
    export DATABASE_URL={{ test_database_url }}
    export JWT_SECRET=not-a-secret-only-for-the-migration-check
    cd backend
    echo "==> upgrade head"
    uv run alembic upgrade head
    echo "==> models and migrations agree"
    uv run alembic check
    echo "==> downgrade base"
    uv run alembic downgrade base
