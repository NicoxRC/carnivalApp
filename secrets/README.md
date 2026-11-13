# Secrets

The backend's secrets live here, **encrypted** with [sops](https://github.com/getsops/sops)
and [age](https://github.com/FiloSottile/age). Variable names are readable; values are
not. That is why these files do go in the repo.

| File | What for |
|---|---|
| `dev.enc.yaml` | Local development |
| `prod.enc.yaml` | Production (Railway) |

Nothing enters this folder in plain text: the `sops-encrypted` pre-commit hook rejects the
commit of any file that is not encrypted (except this README).

## How it works

- **age** uses a key pair. The **public** one (`age1…`) only encrypts and is written in
  `.sops.yaml`. The **private** one (`AGE-SECRET-KEY-…`) is the only one that decrypts: it
  lives in `~/.config/sops/age/keys.txt` of whoever has access and never enters the repo.
- **sops** encrypts each value of the YAML for the public keys in `.sops.yaml` and
  decrypts it with the private one it finds on your machine.
- **Railway never receives a key.** In production Terraform decrypts `prod.enc.yaml` from
  GitHub Actions, with a key pair of its own for CI (`SOPS_AGE_KEY`), and writes the values
  as variables of the service.

All commands are run from the repo root, inside the Nix environment (`nix develop` or
direnv).

## Day to day

```bash
# Start the backend with the development secrets: starts Postgres, applies
# migrations and runs the server (see the justfile)
just dev

# The same, by hand
scripts/local-db.sh        # local Postgres; `scripts/local-db.sh stop` stops it
sops exec-env secrets/dev.enc.yaml 'cd backend && uv run alembic upgrade head'
sops exec-env secrets/dev.enc.yaml 'cd backend && uv run fastapi dev'

# Edit: opens the decrypted file in $EDITOR and encrypts it again on save
just secrets               # or: sops secrets/dev.enc.yaml

# See the values in the terminal
sops -d secrets/dev.enc.yaml
```

`sops exec-env` decrypts in memory, passes each value as an environment variable to the
command and leaves nothing on disk. The app reads them in `backend/app/config.py`.

Tests do not use these files: they have fixed values in `backend/tests/conftest.py`.

**Agents never decrypt.** Only `just dev` and `just migrate` are allowed to them, because
they print nothing; a Claude Code hook (`.claude/hooks/protect-secrets.py`) blocks the
rest. Editing and viewing secrets is for people with a key.

## Variables

Names are uppercase, exactly as the app reads them.

| Variable | Required | What it is |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection (`postgresql+asyncpg://user:password@host:5432/database`) |
| `JWT_SECRET` | yes | Signs sessions. At least 32 characters; a different one per environment |
| `JWT_HOURS` | no (20) | How long a session lasts |
| `CORS_ORIGINS` | no (`http://localhost:3000`) | Origins of the web that may call the API, comma-separated |
| `ENVIRONMENT` | no (`dev`) | `dev` or `prod` |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_CONTACT` | no | Push notifications. Without them the feature turns itself off |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | no | Photos on S3. Without a bucket they are stored on disk |

To generate a new `JWT_SECRET`: `openssl rand -hex 32`.

## Getting access for the first time

Nobody shares a private key. Each person generates their own, registers its public half
with a PR, and the maintainer decides by merging it.

1. Generate your key (once per person):

   ```bash
   mkdir -p ~/.config/sops/age
   age-keygen -o ~/.config/sops/age/keys.txt
   ```

   It prints `Public key: age1…`. Keep a copy of `keys.txt` in your password manager.
2. Open a PR adding your **public** key to `.sops.yaml` (several keys are comma-separated
   in `age:`). Add it only to the files you need: development and production have separate
   rules.
3. Someone who already has access re-encrypts and pushes to the same PR:

   ```bash
   sops updatekeys secrets/dev.enc.yaml
   sops updatekeys secrets/prod.enc.yaml
   ```

   Without this step your key is on the list but cannot open anything.
4. With that change on `trunk`, `just dev` works for you.

## If something goes wrong

- **`no identity matched any of the recipients`**: your private key is not one of those
  that encrypted the file. Check that `~/.config/sops/age/keys.txt` exists and that your
  public key is in `.sops.yaml`.
- **The only private key was lost**: the files cannot be recovered. A new key has to be
  generated, the files created again and **every secret changed** (in production, also in
  the services that use them). Once CI has its own key the files are encrypted for both,
  and either one can re-encrypt for a new key.
- **A private key leaked, or someone leaves the team**: remove their public key from
  `.sops.yaml`, run `sops updatekeys` on each file and **change the secrets**: whoever had
  the key may have read them, and git history keeps the old versions.
