# Backend plan

Plan to replace the backend embedded in `src/app/api/` (and the `local` and `supabase`
adapters in `src/lib/datos/`) with a service of its own. It is written so an agent can
execute it **issue by issue**, explaining each step before doing it and without making
architecture decisions on its own.

Decided stack: **FastAPI + PostgreSQL**, environment with **Nix**, dependencies with **uv**,
secrets with **sops + age**, **pre-commit**, **unit tests with pytest**, **CI/CD on GitHub
Actions** and deployment with **Terraform on Railway** (first iteration).

Order: minimal base → **users and roles** → course and parades → the live parade → content
and community (announcements, events, businesses, photos, push) → deployment → connecting
the web. **Everything `src/app/api/` does today exists in the backend before deploying.**

---

## 0. How to work this plan (read it all if you are an agent)

### Language

- **English:** code, comments, tests, tables and columns, environment variables, HTTP
  routes, JSON keys, enum-like values (roles, permissions, posts, states), docs, commits,
  PRs and issues.
- **Spanish:** only human-readable text inside values, such as the message in
  `{"error": "No existe."}`, and the conversation with the maintainer: step 1 of each issue
  is explained in Spanish.
- The web app (`src/`) is still written in Spanish. Domain terms are translated with
  `docs/backend/GLOSSARY.md`; if an issue introduces a new term or value set, it adds it to
  the glossary in the same PR.

### Step 1 of every issue: explain and wait for the OK

The maintainer is learning several of these tools. **Before creating the branch or touching
a file**, write in the chat, in Spanish:

1. **What you are going to do**, in two or three sentences and without jargon.
2. **How it works**: each new tool or concept of this issue explained as to someone who
   programs but has not used it (what it is, what it is for here, what would happen without
   it). Every issue brings **To understand** as a starting point; expand it with what you
   are actually going to write.
3. **Which files you will create or change**, one per line with a sentence on what for.
4. **Which decisions you are making** that the plan does not fix, if any.
5. **How it is tested**: which command to run and what should be seen.

Then **stop and wait** for the maintainer to say go on. If they ask something, answer it
before starting. Do not chain two issues without a new confirmation. In a module, one
explanation covers all its parts.

### Next steps

2. Create the branch, make the change, run the checks (below).
3. A single commit, and open the PR. In the PR description include **"How it works"** with
   the explanation from step 1 adjusted to what was built, and `Closes #<issue>`.
4. **Stop.** The maintainer merges (see `docs/CONTRIBUTING.md`).

### Rules

- Each `####` section of §2 is **a GitHub issue**; the heading carries its real number
  (`#16 · M1`). `#NN` is the issue. `M#` is a **module**: several parts that deliver
  something working end to end (tables, migration, repository and endpoints together).
  `B##` is the execution order of the parts and of the issues that stand alone.
- **One issue = one branch = one PR = one commit**, and an issue is a whole module, not
  one piece of it. The parts of a module (`#####`) are built in order inside the same
  commit; they are not separate PRs. Step 1 is done once per module and covers every
  part.
- Respect `Depends on`: do not start an issue whose dependencies are not on `trunk`.
- Do only what `What` says. `Out of scope` is not touched even if it looks easy.
- If an issue says **"Needs the maintainer"**, do the code part and leave the manual steps
  written in the PR. Never make up credentials or keys.
- **When porting something from `src/`, the TypeScript code is the specification for
  behaviour.** Read the route and the modules it uses before writing; if the plan and the
  code disagree on a behaviour detail (a limit, a status code), the code wins and you say so
  in the PR. Names are the exception: routes, JSON keys and values are English here (§1.2).
  The other deliberate differences are those of §1.
- **An agent never decrypts or displays secrets.** No `sops -d`, no `sops exec-env` by
  hand, no `just secrets`, no reading the age key. `just dev` and `just migrate` are the
  allowed way to run with the development secrets.

### Branch

```
<type>/<issue-number>-<short-description>
```

`feature/16-login-jwt`, `chore/4-flake-nix`, `docs/3-backend-plan`.

### Commit (and PR title, which is the same)

```
<type>(<scope>): #<issue> <title>

- <why it is done / which decision was made>
- <another bullet if needed>
```

- Types: those of `docs/CONTRIBUTING.md` (`feat`, `fix`, `chore`, `docs`, `test`, `refactor`).
- Scopes: `back` (all of `backend/`, Nix, pre-commit, sops), `infra` (Terraform in
  `infra/`) and `ci` (GitHub Actions). Whatever touches the web uses its usual scopes
  (`datos`, `ui`, `simulacion`…).
- **At least one bullet** explaining the why. The what is already in the diff.
- No AI marks (no `Co-Authored-By`, no "Generated with…").

Example:

```
feat(back): #16 add login with email and password

- Returns a 20 h JWT: a reporter cannot log in again halfway through the
  parade with their hands full.
- Unknown email and wrong password answer the same (401) so as not to
  reveal which emails are registered.
```

### Skills

Before writing backend code read the `fastapi` skill in full
(`.agents/skills/fastapi/`). Where it clashes with this plan, this plan wins (see §1.11).

### Before opening the PR

```bash
just check      # every pre-commit hook on the whole repo
just test       # pytest
just db-test    # only if the issue adds or changes a migration
```

All have to pass. CI runs the first two on every backend PR. If the issue touches the web,
also `npm run typecheck` and `npm test`.

Outside the Nix environment, prefix them with `nix develop -c`.

### Test rule

**Unit** tests with pytest. No real database, no network.

- For every public function or endpoint the issue adds, at least:
  - `test_<thing>_ok`: the good case.
  - `test_<thing>_fails`: the bad case (invalid input, missing resource, no permission…).
- **A third test only if the issue asks for it** in `Tests`, and it is always a very
  specific case (a business rule, a boundary). No tests are added "just in case".
- Endpoints are tested with FastAPI's `TestClient` and repositories replaced by the
  in-memory fakes (`app.dependency_overrides`). Never against Postgres, S3 or a real push
  service.
- Migrations are not unit-tested: they are checked with `just db-test`, which runs them
  against a throwaway Postgres in Docker.

---

## 1. Architecture decisions (already made)

If something does not convince you, open it as a discussion in the PR. Do not change it
silently.

### 1.1 Monorepo

```
flake.nix                  development environment (root: used by back, infra and CI)
justfile                   project commands (`just dev`, `just test`…)
docker-compose.yml         throwaway Postgres for `just db-test`
.pre-commit-config.yaml
.sops.yaml
secrets/                   *.enc.yaml encrypted with sops (never plain text)
backend/
  pyproject.toml  uv.lock  alembic.ini  Dockerfile
  app/
    main.py                creates the app, mounts routers, CORS, errors
    config.py              pydantic-settings
    db.py                  async engine and session
    errors.py              uniform error format
    security.py            passwords, JWT, user and permission dependencies
    permissions.py         roles, permissions and the table that joins them
    rate_limits.py         limits per IP / device (in memory)
    realtime.py            LISTEN/NOTIFY → SSE
    storage.py             photos: local disk or S3
    push.py                sending web push notifications
    models.py              tables (SQLAlchemy)
    domain/                pure logic, no I/O
    schemas/               Pydantic models of the HTTP contract
    repositories/          protocol + Postgres + in-memory fake, one per resource
    routers/               one file per resource
    cli.py                 admin commands (create admin, seed)
  migrations/              Alembic
  seed/                    course.json, sample data and fixtures exported from the web
  tests/
infra/                     Terraform (Railway)
```

### 1.2 The HTTP contract

The web consumes `src/app/api/` today, with routes and JSON in Spanish. The backend exposes
**the same resources with the same behaviour, named in English**: routes, JSON keys
(camelCase) and enum-like values. Connecting the web (phase 7) therefore means changing the
base URL, the login **and mapping names** in the web's `api` adapter; screens do not change.

| Route | Access | Issue |
|---|---|---|
| `GET /api/health` | public | B03, B07 |
| `POST /api/auth/login`, `GET /api/auth/me` | public / session | B14 |
| `GET/POST/PATCH/DELETE /api/admin/users` | `users:manage` | B17 |
| `GET /api/course` | public | B21 |
| `GET /api/schedule` | public | B22, B36 |
| `GET/PUT/PATCH/DELETE /api/admin/parades` | `parades:*` | B23 |
| `POST /api/positions` | `positions:*` | B28 |
| `GET /api/state` | public | B29 |
| `GET /api/state/stream` | public | B30 |
| `GET /api/parades/{id}/progress` | public | B31 |
| `POST /api/device` | public, rate-limited by IP | B33 |
| `GET/POST /api/density` | public / device | B34 |
| `GET/POST/DELETE /api/admin/announcements` | `announcements:manage` | B35 |
| `GET/PUT/DELETE /api/admin/events` | `schedule:edit` | B36 |
| `GET /api/businesses`, `GET/PUT/DELETE /api/admin/businesses` | public / `businesses:edit` | B37 |
| `POST /api/businesses/event`, metrics in admin | public / `metrics:view` | B38 |
| `GET/POST /api/photos`, `GET /api/photos/{id}` | public / device | B40 |
| `GET/PATCH/DELETE /api/admin/photos` | `photos:moderate` | B41 |
| `GET/POST/DELETE /api/push-subscriptions` | public | B42 |
| ~~web's `/api/admin/sesion`, `/api/reportero/sesion`~~ | — | replaced by `/api/auth` |
| ~~web's `/api/admin/reporteros`~~ | — | replaced by `/api/admin/users` |
| ~~web's `POST /api/simulacion`~~ | — | **not ported**: the simulator is `npm run simular` with an `ingest` user |

- Errors: always `{"error": "<message in Spanish>"}` with the right HTTP status. Validation
  errors answer **400**, as the web does today, not FastAPI's 422.
- Pydantic: `model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)`;
  responses go out `by_alias=True`. Python attributes are snake_case, JSON keys camelCase.
- **There is no "the" parade: there is the CURRENT parade** (`src/lib/desfiles.ts`). The
  server resolves it; the public client does not send an id. An id that does not exist
  gives 404; a parade is never created because someone asked for it.
- **"Today" and "now" are Pasto time** (`America/Bogota`), as in `src/lib/fecha.ts`.

### 1.3 Users, roles and permissions

- **The public has no account.** Watching the parade, contributing to the crowd map,
  uploading photos and asking for notifications stay anonymous (with the signed device id
  where it is used today).
- **The team does:** login with **email and password**. It replaces the single admin
  password (`ADMIN_CLAVE`), the reporter codes and the `INGESTA_TOKEN`.
- **Roles → permissions.** A user has one or several roles (table `user_roles`). Endpoints
  never ask for a role: they ask for a **permission**. The table that joins roles and
  permissions lives in code (`app/permissions.py`), versioned and tested.

| Role | For whom | Permissions |
|---|---|---|
| `admin` | owners of the system | all |
| `coordinator` | whoever runs parade day | `parades:state`, `announcements:manage`, `users:view`, `positions:any` |
| `editor` | whoever loads content | `parades:edit`, `schedule:edit`, `businesses:edit`, `metrics:view` |
| `moderator` | whoever reviews photos | `photos:moderate` |
| `reporter` | whoever walks with the parade | `positions:own` |
| `ingest` | service accounts (simulator, tools) | `positions:any` |

- **The reporter's post.** What the web code calls `Rol` (`cabeza` | `mitad` | `cola`) is
  the user's **`post`** in the backend (`head` | `middle` | `tail`), so it does not clash
  with access roles. In the JSON of positions and state the key is `post`. With
  `positions:own` the server sets the post and the current parade; the body cannot choose
  them.
- **Passwords** hashed with **Argon2** (`pwdlib`). Minimum 10 characters. Never in clear.
- **Session with JWT** (`pyjwt`, HS256) signed with `JWT_SECRET`, in
  `Authorization: Bearer <token>`. It lasts 20 h (a whole parade day, like the reporter's
  cookie today). No refresh tokens. The token carries only the user id: roles and `active`
  are read from the database on every request, so deactivating someone cuts their session
  instantly.
- **Bearer and not cookies:** the mobile app does not handle cookies well and the backend
  lives on a different domain than the web. The price: the web keeps the token in the
  browser; it is mitigated with the CSP the web already has and the short duration.
- **Brute-force brake** on login: growing wait per IP (up to 5 s), without blocking, like
  `frenar()` in `src/lib/sesion.ts`.
- The first admin is created from the console (`python -m app.cli create-admin`).

### 1.4 The course is still 1D

- Projecting lat/lng to "metres from the start" is done **in Python** with `shapely` on the
  course reprojected to UTM 18N (EPSG:32618) with `pyproj`. No PostGIS.
- It is computed **once on insert** and stored in `positions.course_m`.
- The course is stored in the `courses` table (GeoJSON) and loaded in memory at startup.
- Parity with the web: a fixture exported with turf (`backend/seed/projections.json`)
  guarantees Python and TypeScript give the same number (±2 m).
- **The ETA the user sees is still computed on the client** (`src/lib/eta.ts`). The backend
  only ports `estimarVelocidad` because it needs it for push notifications (B43).

### 1.5 Database

- PostgreSQL 16. SQLAlchemy 2 async + asyncpg. Migrations with Alembic, named with a short
  sequential number: `0001_users.py`, `0002_…`.
- The schema starts from `supabase/schema.sql`, **without** what belongs to Supabase
  (`auth.users`, RLS, `supabase_realtime`, `storage.buckets`) and with tables and columns in
  English. `reporteros` is replaced by `users`. The tables `anunciantes` and `promociones`
  are **not** ported (nothing uses them).
- Enum-like columns are `text` with a `check` constraint, not Postgres `ENUM` types.
- Positions: `ts` (device time) and `received_at` (server clock) are stored. The "latest
  position" of each post is the one with the **highest `ts`**.
- **Restarting a parade does not delete rows** (deliberate difference with `trunk`, which
  deletes them): `parades.run_started_at` is stored and reads ignore whatever is older. A
  restart by mistake on December 31 cannot destroy data.

### 1.6 Real time

- FastAPI's native SSE: `response_class=EventSourceResponse` (`fastapi.sse`) and `yield`.
  Heartbeat every 20 s.
- Every insert into `positions`, state change or new announcement does
  `NOTIFY parade_<id>`. The stream listens with a dedicated asyncpg connection (`LISTEN`)
  and forwards the snapshot. It works the same with one replica or several.

### 1.7 Rate limits

Today's limits (device issuing per IP, photos per device, login) live in process memory, as
on `trunk`. That is fine because in this iteration Railway runs **a single replica**. If it
scales to several, they have to move to Postgres (outside this plan). The IP comes from the
header Railway sets (`X-Real-IP` / last hop of `X-Forwarded-For`), never from the first hop.

### 1.8 Photos and push

- **Photos:** a `Storage` interface with two implementations: disk (`backend/.photos/`,
  development) and S3-compatible (`boto3`; a Railway bucket or Cloudflare R2 in production).
  Images are served through the API (`GET /api/photos/{id}`), not with a public bucket URL:
  that way a pending photo is never reachable.
- **Push:** `pywebpush` with VAPID keys (the same ones `npm run push:llaves` generates).
  Without keys, the feature turns itself off, as today.

### 1.9 Secrets

- `sops` + `age`. Files `secrets/dev.enc.yaml` and `secrets/prod.enc.yaml`, one rule per
  file in `.sops.yaml` so different people can have access to each.
- There is no `backend/.env`: configuration comes only from environment variables, and
  locally `sops exec-env` sets them (wrapped by `just dev` and `just migrate`).
- In Terraform: the `carlpett/sops` provider reads `prod.enc.yaml` and writes it as service
  variables on Railway. Railway never receives an age key.
- In GitHub Actions only `SOPS_AGE_KEY` (a key pair of its own for CI) and `RAILWAY_TOKEN`
  exist.
- A pre-commit hook rejects any unencrypted file in `secrets/`. A Claude Code hook
  (`.claude/hooks/protect-secrets.py`) stops agents from decrypting.

### 1.10 Deployment and dependencies

- Railway, provider `terraform-community-providers/railway`, a single environment
  (`production`), one replica.
- Image built in CI with the `Dockerfile` in `backend/`, published to GHCR with the commit
  SHA. Migrations in the pre-deploy step (`alembic upgrade head`).

| Use | Python 3.12 packages |
|---|---|
| App | `fastapi[standard]`, `pydantic-settings`, `sqlalchemy[asyncio]`, `asyncpg`, `alembic`, `pwdlib[argon2]`, `pyjwt`, `shapely`, `pyproj`, `boto3`, `pywebpush` |
| Dev | `pytest`, `pytest-asyncio`, `httpx`, `ruff`, `mypy` |

Do not add dependencies outside this table without saying so in the PR.

### 1.11 Where this plan departs from the `fastapi` skill

- **SQLAlchemy 2 async instead of SQLModel.** The app is async (SSE, LISTEN/NOTIFY) and
  SQLModel's async support is a step behind. HTTP schemas are Pydantic models separate from
  the tables.
- **mypy instead of ty.** mypy `--strict` is what the team already uses.
- **Railway, not FastAPI Cloud** (decision of this iteration).

Everything else in the skill applies: `Annotated` with type aliases for dependencies, return
types instead of `response_model` when possible, prefix, tags and dependencies on the
`APIRouter`, one function per HTTP operation, no `...` as a default and no `RootModel`, and
`def` instead of `async def` when what is inside blocks (Argon2, shapely, boto3).

---

## 2. Issues

Each issue brings: **To understand** (starting point for the step 1 explanation),
**Depends on**, **What**, **Acceptance**, **Tests** and **Out of scope**. Issues marked
**Done** are kept as a record and describe what was actually built.

From phase 2 on, the open issues are grouped **by module** (`M1`…`M9`, issue #77): the
first issues of the plan were one small piece each, and reviewing them one by one cost a
full round of explanation, review and merge per piece. The former issues stay as the
parts of their module, with their `B##` code.

---

### Phase 0 — Rules of the game

#### #3 · B01 · `docs(repo)`: add the backend plan and adapt CONTRIBUTING to issues

- **Status:** done.
- **What:** this document, the issue-based workflow in `docs/CONTRIBUTING.md` (branch
  `<type>/<issue>-<desc>`, commit `<type>(<scope>): #<issue> <title>` with at least one
  bullet, scopes `back` and `infra`), the link from `CLAUDE.md` and the `fastapi` skill.

---

### Phase 1 — Minimal base (a server exists)

#### #4 · B02 · `chore(back)`: add the development environment with Nix

- **Status:** done.
- **To understand:** Nix describes in one file (`flake.nix`) exactly which tools and
  versions the project needs. `nix develop` opens a shell with all of them, the same on
  your machine, on someone else's and in CI, without installing anything globally.
  `flake.lock` freezes versions, like `package-lock.json` in npm.
- **What:** `flake.nix` at the root with `devShells.default`: `python312`, `uv`,
  `postgresql_16`, `sops`, `age`, `just`, `pre-commit`, `terraform`, `tflint`, `gitleaks`,
  `nixfmt-rfc-style`, `nodejs_22`. On Linux it exposes `libstdc++` and `zlib`, which
  prebuilt PyPI packages need. `.envrc` with `use flake` for direnv.

#### #5 · B03 · `chore(back)`: create the FastAPI skeleton with a health endpoint

- **Status:** done.
- **To understand:** FastAPI is a Python web framework: you define functions and decorate
  them with the route. It uses Python types to validate what comes in and document what
  goes out (it generates `/docs` on its own). `uv` is the package manager:
  `pyproject.toml` lists what is needed and `uv.lock` freezes versions. `/api/health` is
  what Railway queries to know whether the server is alive.
- **What:** `backend/` with `pyproject.toml` (dependencies of §1.10, `uv.lock`),
  `app/main.py`, `app/routers/health.py` with `GET /api/health`, pytest, ruff and mypy
  configured, `[tool.fastapi] entrypoint = "app.main:app"`.

#### #6 · B04 · `chore(back)`: configure pre-commit

- **Status:** done.
- **To understand:** pre-commit runs automatic checks on every `git commit`; if one fails,
  the commit is not made. That way formatting, types and leaked secrets are caught on your
  machine. `ruff` formats and detects common errors, `mypy` checks types, `gitleaks` looks
  for keys pasted by mistake.
- **What:** `.pre-commit-config.yaml` at the root with local hooks that use the flake's
  tools: `ruff check --fix` and `ruff format` on `^backend/`, `mypy --strict` on
  `^backend/app/`, `gitleaks` on what is staged, `nixfmt`, `trailing-whitespace`,
  `end-of-file-fixer`, `check-yaml`, `check-merge-conflict`, `sops-encrypted`
  (`scripts/check-sops.sh`: fails if a file in `^secrets/` lacks the `sops` key) and
  `terraform fmt -check` on `^infra/`. Enable once per clone with `pre-commit install`;
  commits are then made from inside the Nix environment.

#### #7 · B05 · `chore(ci)`: add the backend CI on GitHub Actions

- **Status:** done.
- **To understand:** CI is a GitHub machine that, on every PR, runs the same checks you run
  locally. If something fails, the PR shows red. It uses the same `flake.nix`, so "works on
  my machine" and "works in CI" mean the same.
- **What:** `.github/workflows/backend-ci.yml`. On `pull_request` to `trunk` when
  `backend/**`, `flake.*`, `.pre-commit-config.yaml` or the workflow change, three jobs with
  their own names: `pre-commit`, `gitleaks` (scans the commits of the PR) and `pytest`. The
  web's old workflow (`ci.yml`) was removed and is to be rebuilt separately, filtered by
  paths.

#### #8 · B06 · `feat(back)`: load configuration from environment variables

- **Status:** done.
- **To understand:** what changes between your machine and production (database URL, JWT
  secret) does not go in the code: it goes in environment variables. `pydantic-settings`
  reads them at startup and validates them; if a required one is missing, the server does
  not start and says which.
- **What:** `app/config.py`: `DATABASE_URL` and `JWT_SECRET` (required, the secret with at
  least 32 characters), `JWT_HOURS` (20), `CORS_ORIGINS` (`http://localhost:3000`,
  comma-separated), `ENVIRONMENT` (`dev` | `prod`). Optional for later:
  `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_CONTACT`, `S3_ENDPOINT`, `S3_BUCKET`,
  `S3_ACCESS_KEY`, `S3_SECRET_KEY`. It only reads environment variables, with no `.env`
  file (see §1.9). `get_settings()` with `lru_cache` as a dependency. CORS mounted in
  `main.py`.

#### #31 · B44 · `chore(back)`: manage secrets with sops and age

- **Status:** done (moved up from phase 6 so the backend never depended on a plain-text
  file).
- **To understand:** `age` generates a key pair. `sops` encrypts a YAML with the public
  one: variable names stay readable and values are encrypted. That file does go in the
  repo; only whoever has the private key (the maintainer, CI) can read it.
- **What:** `.sops.yaml` with one rule per file, `secrets/dev.enc.yaml`,
  `secrets/prod.enc.yaml` and `secrets/README.md` (daily use, variable list, how to give
  someone access, what to do if a key is lost or leaked).

#### #9 · B07 · `feat(back)`: connect to Postgres with async SQLAlchemy and Alembic

- **Status:** done.
- **To understand:** SQLAlchemy is the layer that talks to Postgres from Python; in async
  mode it does not block the server while waiting for the database. Alembic versions the
  schema: each table change is a numbered migration file that is applied (`upgrade`) or
  reverted (`downgrade`), like commits but for the database.
- **What:** `app/db.py` (async engine, `get_session()` as a dependency with `yield`),
  `app/models.py` with `Base`, Alembic in `backend/migrations/` in async mode,
  `scripts/local-db.sh` (the flake's Postgres in `backend/.pgdata/`, no Docker).
  `/api/health` answers `{"ok", "db", "time"}` with a `SELECT 1`; without a database it
  answers 503.

#### #10 · B08 · `feat(back)`: answer every error with the same format

- **Status:** done.
- **To understand:** FastAPI answers validation errors with its own structure
  (`{"detail": [...]}`). Clients expect `{"error": "..."}`. An *exception handler*
  intercepts errors before they leave and rewrites them, so every endpoint answers the same
  without repeating it in each one.
- **What:** `app/errors.py` with handlers for `HTTPException`, `RequestValidationError`
  (answers **400**) and `Exception` (answers a generic message and logs the detail) →
  `{"error": "<message in Spanish>"}`, registered in `main.py`.

#### #66 · `refactor(back)`: rename the backend code to English

- **Status:** done. Everything written until then moved from Spanish to English, including
  the HTTP contract. `docs/backend/GLOSSARY.md` records the translation of domain terms.

#### #69 · `chore(back)`: add one-command dev tasks with just

- **Status:** done.
- **What:** a `justfile` (`just dev`, `just migrate`, `just test`, `just check`,
  `just db-test`…), `docker-compose.yml` with a throwaway Postgres for checking migrations,
  and the Claude Code hook that stops agents from decrypting secrets.

#### #67 · `docs(repo)`: translate the docs and contribution rules to English

- **Status:** done with this document. Open issues were rewritten in English from its
  sections.

#### #77 · `docs(repo)`: group the remaining backend issues by module

- **Status:** done with this document. See the note at the start of §2.

---

### Phase 2 — Users and roles

#### #11 · B09 · `feat(back)`: create the users and roles tables

- **Status:** done.
- **To understand:** it is the first real migration. `users` stores who each team member
  is; `user_roles` says which roles they have (there can be several: someone can be editor
  and moderator). The password is never stored, only its hash.
- **Depends on:** B07
- **What:** models and migration `0001_users` (and switch `alembic.ini` to the short
  sequential naming of §1.5):
  - `users`: `id uuid`, `email text unique` (lowercase, enforced with a check), `name`,
    `password_hash`, `post` (check `head` | `middle` | `tail`, nullable),
    `active bool default true`, `last_signal_at timestamptz null`, `created_at`.
  - `user_roles`: `user_id` (FK, `on delete cascade`), `role` (check with the six roles of
    §1.3), composite PK.
- **Acceptance:** `just db-test` passes: `alembic upgrade head`, `alembic check` and
  `alembic downgrade base` work.
- **Out of scope:** login.

#### #12 · B10 · `feat(back)`: hash and verify passwords with Argon2

- **Status:** done.
- **To understand:** a hash is a one-way transformation: the hash comes out of the
  password, but you cannot go back from the hash to the password. To verify a login, what
  the person typed is hashed and compared. Argon2 is slow on purpose, so that if someone
  steals the database they cannot try millions of passwords per second.
- **Depends on:** B03
- **What:** in `app/security.py`, `hash_password(text) -> str` and
  `verify_password(text, hash) -> bool` with `pwdlib` (Argon2). `validate_password`
  requires at least 10 characters.
- **Tests:** `test_verify_password_ok`, `test_verify_password_fails` and **specific**:
  `test_same_text_gives_different_hashes` (the random salt).

#### #13 · B11 · `feat(back)`: define roles and their permissions

- **Status:** done.
- **To understand:** instead of each endpoint asking "is this an admin or a coordinator?",
  each one asks for a **permission** ("can they change the parade state?"). A single table
  in code says which permissions each role gives. Adding a role or moving a permission is
  changing that table, not hunting for `if`s across the code.
- **Depends on:** B03
- **What:** `app/permissions.py` with `Role` and `Permission` (`StrEnum`),
  `PERMISSIONS_BY_ROLE` (the table of §1.3) and `permissions_for(roles) -> set[Permission]`.
  `admin` has every permission by construction, not by list.
- **Tests:** `test_permissions_for_ok` (editor + moderator add up both sets),
  `test_permissions_for_fails` (reporter does not have `parades:state`) and **specific**:
  `test_admin_has_every_permission` (walks `Permission`: if someone adds one, admin has
  it).

#### #14 · B12 · `feat(back)`: add the users repository

- **Status:** done.
- **To understand:** a repository hides the database behind simple functions (`create`,
  `by_email`). Routers talk to the repository, not to SQL. There are two implementations
  of the same interface: Postgres (the real one) and an in-memory one that tests use, so
  they are fast and need no database.
- **Depends on:** B09
- **What:** `app/repositories/users.py` with a `Protocol` (`create`, `by_email`, `by_id`,
  `list`, `update`, `set_roles`, `delete`, `mark_signal`), `UsersPostgres` and
  `UsersMemory`. Alias `UsersRepoDep`.
- **Tests (memory):** `test_create_user_ok`, `test_create_user_fails` (repeated email →
  `UserAlreadyExists`) and **specific**: `test_email_is_case_insensitive`.

#### #15 · B13 · `feat(back)`: create the first admin from the console

- **Status:** done.
- **To understand:** to create users you need to be an admin, but at the beginning there
  is none: chicken and egg. It is solved with a command that is run by hand once and asks
  for the password without showing it on screen.
- **Depends on:** B10, B11, B12
- **What:** `python -m app.cli create-admin --email X --name Y` (password with `getpass`,
  asked twice).
- **Tests:** `test_create_admin_ok`, `test_create_admin_fails` (short password → exits
  with an error and creates nothing).

#### #16 · M1 · `feat(back)`: add login, permissions and user management

- **To understand:** the team's accounts, end to end: someone logs in, the server knows who
  they are on every request, each endpoint asks for a permission, and an admin registers the
  rest of the team from the API.
- **Depends on:** #15 (B13)
- **Parts:** B14, B15, B16, B17, built in that order and delivered in a single commit. It
  replaces the former issues #17, #39, #40, closed in favour of this one.
- **Acceptance:** `just check` and `just test` pass, and `just db-test` if a migration
  changed. Every part below is in.

##### B14 · Add login with email and password

- **To understand:** login verifies the password and returns a **JWT**: a text signed with
  `JWT_SECRET` that says "I am user X, valid until such time". The client sends it on every
  request (`Authorization: Bearer ...`) and the server checks the signature. If someone
  modifies it, the signature stops matching. Roles and `active` are not in the token: they
  are read from the database, so deactivating someone takes them out instantly.
- **What:** `POST /api/auth/login` with `{email, password}` → `{token, expiresAt, user}`
  (user with `id`, `email`, `name`, `roles`, `permissions`, `post`). `GET /api/auth/me`
  returns the same without a new token. `create_token` / `read_token` in
  `app/security.py`. Dependency `CurrentUserDep` (valid token, user exists and is active).
  Unknown email and wrong password answer the same: 401 «Correo o contraseña incorrectos.».
- **Tests:** `test_login_ok`, `test_login_fails` (wrong password → 401) and **specific**:
  `test_deactivated_user_loses_the_session` (valid token, deactivated user → 401).

##### B15 · Protect routes by permission

- **To understand:** in FastAPI protection is done with **dependencies**: a function that
  runs before the endpoint and cuts with 401 (I do not know who you are) or 403 (I know who
  you are but you cannot). Routers only declare the permission they ask for:
  `APIRouter(dependencies=[require(Permission.PHOTOS_MODERATE)])`.
- **What:** `require(*permissions)` in `app/security.py` (every permission asked for is
  needed) and alias `UserWithPermission`. Messages as today: 401 «Hace falta iniciar
  sesión.», 403 «No tenés permiso para esto.».
- **Tests:** `test_require_ok`, `test_require_fails` (moderator asking for `parades:state`
  → 403) and **specific**: `test_no_token_is_401_not_403`.

##### B16 · Slow down brute-force login attempts

- **To understand:** if someone tries passwords by brute force, each recent failure from
  their IP makes the next answer take longer (up to 5 s). It blocks no one: blocking by IP
  left the real admin out when many people share a mobile carrier's IP (see the comment on
  `frenar()` in `src/lib/sesion.ts`).
- **What:** `app/rate_limits.py` with `ip_of(request)` (§1.7) and `LoginRateLimit`
  (`wait(ip)`, `record(ip, ok)`, 10 min window, 500 ms per failure, 5 s cap, pruning of the
  map). Used in `/api/auth/login`. The clock and the `sleep` are injected so it can be
  tested without waiting.
- **Tests:** `test_login_rate_limit_ok` (no failures, no wait),
  `test_login_rate_limit_fails` (3 failures → 1.5 s) and **specific**:
  `test_ip_is_the_last_hop_of_forwarded_for`.

##### B17 · Manage users from the API

- **To understand:** with login and permissions ready, the team is registered from the API
  instead of the console. Deactivating instead of deleting keeps the history of who
  reported what. It replaces the web's `/api/admin/reporteros` and the access codes.
- **What:** router `/api/admin/users`:
  - `GET` (`users:view`): list with `lastSignalAt`, never `password_hash`.
  - `POST` (`users:manage`): `{email, name, password, roles, post}`.
  - `PATCH /{id}` (`users:manage`): `name`, `roles`, `post`, `active`, `password` (reset).
  - `DELETE /{id}` (`users:manage`): only if they never sent positions; otherwise 409 and
    deactivating is asked for.
  - Validation: `reporter` requires `post`; nobody removes the `admin` role from
    themselves.
- **Tests:** `test_create_user_ok`, `test_create_user_fails` (editor tries → 403) and
  **specific**: `test_reporter_without_post_is_400`.
- **Out of scope:** password recovery by email.
---

### Phase 3 — Course and parades

#### #18 · M2 · `feat(back)`: add the course and the parades

- **To understand:** everything that does not move: the course every position is measured
  against, the parades of the carnival with their schedule, and which one is the current
  one.
- **Depends on:** #16 (M1)
- **Parts:** B18, B19, B20, B21, B22, B23, built in that order and delivered in a single
  commit. It replaces the former issues #19, #20, #21, #22, #41, closed in favour of this
  one.
- **Acceptance:** `just check` and `just test` pass, and `just db-test` if a migration
  changed. Every part below is in.

##### B18 · Create the courses and parades tables

- **To understand:** the course is the physical route (a line in GeoJSON); a parade is a
  specific day that walks a course, with date, time and state (`scheduled`, `in_progress`,
  `finished`). `run_started_at` marks since when positions count, to restart without
  deleting (§1.5).
- **What:** migration `0002`: `courses` and `parades` as `sendas` and `desfiles` in
  `supabase/schema.sql`, plus `parades.run_started_at timestamptz not null default now()`.
- **Acceptance:** `just db-test` passes.

##### B19 · Export the web's data and seed the database

- **To understand:** the course and the sample data live in `src/data/` today. A script
  exports them to JSON so the backend can load them, and along the way stores test points
  computed with turf to check later that Python gives the same metres. "Seeding" is loading
  the initial data; idempotent means running it twice leaves the same result.
- **What:**
  - `scripts/export-seed.ts` (with `tsx`): writes to `backend/seed/` `course.json` (with
    waypoints already projected), `parades.json`, `events.json`, `businesses.json` (from
    `src/data/*-ejemplo.json`) and `projections.json` (~10 points with `metres` and
    `offsetM` from turf: one before the start, one after the end, one 300 m off the
    course). The export translates keys and values with the glossary.
  - `python -m app.cli seed`: inserts course and parades. Events and businesses are seeded
    by the issue that creates their table (B36, B37).
  - `app/repositories/parades.py` (Protocol + Postgres + memory) with what seeding uses.
- **Tests:** `test_seed_ok`, `test_seed_fails` (course.json without `geojson` → clear
  error) and **specific**: `test_seeding_twice_does_not_duplicate`.
- **Out of scope:** real data (it is still sample data).

##### B20 · Project points onto the course in metres

- **To understand:** it is the central idea of the project (README, "the course is 1D"):
  any lat/lng snaps to the nearest point of the route and is reduced to "metres from the
  start". Degrees are not metres, so first the course is moved to UTM 18N, a coordinate
  system in metres for the Pasto area, and there `shapely` measures.
- **What:** `app/domain/course.py`: `Course.from_geojson(...)`, `course_metres(lat, lng)
  -> Projection(metres, offset_m, lat, lng)`, `point_at_metre(metres)`, `length_metres`,
  `waypoints` and `waypoint_by_id`. Constant `MAX_USER_OFFSET_M` equal to
  `DESVIO_MAX_USUARIO_M` in `src/lib/senda.ts`.
- **Tests:** `test_course_metres_ok`, `test_course_metres_fails` (lat out of range →
  `ValueError`) and **specific**: `test_parity_with_turf` (±2 m over
  `seed/projections.json`).
- **Out of scope:** reference phrases ("va por Cristo Rey"): the web paints them.

##### B21 · Expose the course at GET /api/course

- **To understand:** the course almost never changes, so it is answered with
  `Cache-Control` so the browser and the service worker keep it and do not ask for it on
  every load.
- **What:** same response as `src/app/api/senda/route.ts`, in English, with the same
  `Cache-Control`.
- **Tests:** `test_course_ok`, `test_course_fails` (no course loaded → 503 with `error`).

##### B22 · Resolve the current parade and expose the schedule

- **To understand:** the Carnival has one parade per day and the app does not ask which one
  to watch: it shows the one happening, or today's, or the next one, or the last one there
  was (rule in `src/lib/desfiles.ts`). "Today" is computed in Pasto time, not with the
  server clock (which on Railway is UTC).
- **What:**
  - `app/domain/dates.py`: `today_in_pasto(ts)` and `normalize_time` (port of
    `src/lib/fecha.ts`).
  - `app/domain/parades.py`: `current_parade(parades, today)`.
  - `resolve_parade(id | None)` as a dependency, with a 2 s cache of the list (like
    `listarDesfilesCacheado`).
  - `GET /api/schedule` → `{parades, events: [], today, currentId}` (events arrive in
    B36).
- **Tests:** `test_current_parade_ok` (one in progress → that one),
  `test_current_parade_fails` (empty list → `None`) and **specific**:
  `test_today_in_pasto_at_8_pm_is_still_today` (01:00 UTC of the next day).

##### B23 · Manage parades

- **To understand:** the parade state is changed by a person, not by the code. Restarting
  (back to `scheduled`) moves `run_started_at` to "now": old positions stay stored but are
  not shown. Creating or editing name, date and time is another permission, because someone
  else does it (whoever loads the schedule).
- **What:** port of `src/app/api/admin/desfiles/`: `GET` and `PUT /{id}` (`parades:edit`,
  validation of `validarDesfile` in `src/lib/programacion.ts`), `PATCH /{id}` with
  `{action: "start" | "finish" | "restart"}` (`parades:state`), `DELETE /{id}`
  (`parades:edit`).
- **Tests:** `test_parade_action_ok`, `test_parade_action_fails` (editor tries to start →
  403) and **specific**: `test_restart_moves_run_started_at`.
---

### Phase 4 — The live parade

#### #23 · M3 · `feat(back)`: add the live parade state

- **To understand:** the heart of the app: reporters send positions, the server turns them
  into the state of the parade, and the public reads it as a snapshot, as a live stream and
  as progress along the waypoints.
- **Depends on:** #18 (M2)
- **Parts:** B24, B25, B26, B27, B28, B29, B30, B31, built in that order and delivered in a
  single commit. It replaces the former issues #24, #25, #26, #42, #27, #28, #43, closed in
  favour of this one.
- **Acceptance:** `just check` and `just test` pass, and `just db-test` if a migration
  changed. Every part below is in.

##### B24 · Create the positions and presences tables

- **To understand:** `positions` is the history of where each reporter was (the table that
  writes the most); `presences` is one row per phone of the public with the 100 m stretch
  where it is, which is overwritten and never stores lat/lng (README, "Crowd map").
- **What:** migration `0003`: `positions` as `posiciones` in the current schema with
  `user_id` (FK to `users`) instead of `reportero_id`, `post` instead of `rol`, plus
  `ts timestamptz not null` and `received_at timestamptz default now()`, index
  `(parade_id, post, ts desc)`. `presences` same as `presencias` in the current schema.
- **Acceptance:** `just db-test` passes.

##### B25 · Define the parade state schemas

- **To understand:** they are the "shapes" of the JSON that goes in and out, written as
  Pydantic classes. They validate on their own (an odd `post` or a `lat` of 200 are
  rejected before reaching the code) and go out in camelCase.
- **What:** `app/schemas/` with `PositionInput` (with optional `waypointId`), `Position`,
  `HistorySample`, `ParadeState` (with `date`, `startTime`, `announcements`),
  `Announcement`, `Parade`, `Density`, `DensityBin`, after `src/lib/tipos.ts`. Each schema
  notes the web type it mirrors, so the web's `api` adapter (B51) can map them.
- **Tests:** `test_position_input_ok`, `test_position_input_fails` (post `"tail2"`) and
  **specific**: `test_state_serializes_in_camelcase`.

##### B26 · Add the parade state repository

- **To understand:** it is the Python equivalent of the "live" part of `AdaptadorDatos`
  (`src/lib/datos/adaptador.ts`). The rules of §1.5 live here: the latest position is the
  one with the highest `ts`, `run_started_at` is respected and the first report of a
  scheduled parade moves it to `in_progress`.
- **What:** `app/repositories/state.py` (Protocol + Postgres + memory):
  `record_positions(entries, user_id)`, `read_state`, `last_sender(parade, post)`,
  `read_progress`, `record_presence`, `read_presences`. It updates
  `users.last_signal_at`.
- **Tests (memory):** `test_record_positions_ok`, `test_record_positions_fails` (missing
  parade → `ParadeNotFound`) and **specific**: `test_old_packet_does_not_overwrite_new`.
- NOTIFY is not issued here: it comes with B30, below.

##### B27 · Validate position batches

- **To understand:** the reporter's phone keeps the sends that fail and sends them later
  as a batch. One bad point cannot bring down the whole batch (the queue would get stuck
  retrying the same thing): it is discarded and counted. It is pure logic, no database or
  HTTP.
- **What:** `app/domain/positions.py` with `validate_batch(body, forced_post, parade_id,
  now, course)` → `(entries, discarded)` or an error, exact port of `validar()` in
  `src/app/api/posiciones/route.ts`: `MAX_BATCH` 200, `waypointId` → point on the course,
  discards future > 2 min, older than 1 h and accuracy > `MAX_ACCURACY_M`; sorts by `ts`.
- **Tests:** `test_validate_batch_ok`, `test_validate_batch_fails` (201 points → error)
  and **specific**: `test_point_with_bad_accuracy_is_discarded_without_failing_the_batch`.

##### B28 · Receive positions at POST /api/positions

- **To understand:** it is the only way in for positions. A reporter can only send their
  own post and always to the current parade. If two reporters have the same post, the one
  sending is the holder and the other waits until the holder goes silent for a minute
  (**handover**): otherwise the head would jump between two phones blocks apart.
- **What:** port of `src/app/api/posiciones/route.ts`. With `positions:own` the server
  sets the post and the parade and applies the handover (`HANDOVER_MS`, `RELEVO_MS` in the
  web); with `positions:any` the body can name the parade (which has to exist) and the
  post. Response `{ok, saved, discarded, waiting, serverTs}`.
- **Tests:** `test_positions_ok`, `test_positions_fails` (no token → 401) and
  **specific**: `test_second_reporter_on_the_same_post_waits`.
- **Out of scope:** push notifications when the head arrives (B43, in M8).

##### B29 · Expose the snapshot at GET /api/state

- **To understand:** the snapshot is the full picture of the parade now: where each part
  is, the last 16 min of the head (with that the web computes the ETA), the announcements
  and the server time (so as not to depend on the phone's clock).
- **What:** optional `?parade=` (without it, the current one), 404 «No hay desfile.», same
  `Cache-Control` as the current route in production.
- **Tests:** `test_state_ok`, `test_state_fails` (no parades → 404).

##### B30 · Stream the live state over SSE

- **To understand:** SSE (Server-Sent Events) is an HTTP connection that stays open and
  through which the server pushes messages when there is news, instead of the phone asking
  every few seconds. For it to work with several instances, Postgres does the notifying: on
  saving a position a `NOTIFY` is issued, and each server with open streams listens with
  `LISTEN` and forwards.
- **What:** `GET /api/state/stream` with `EventSourceResponse`. First event immediately
  with the snapshot; one for each `NOTIFY parade_<id>`; heartbeat every 20 s. The Postgres
  repository issues `NOTIFY` when recording positions and when changing state.
  `app/realtime.py` abstracts the listening so a fake can be used in tests.
- **Tests:** `test_stream_ok` (first event is the snapshot), `test_stream_fails` (no
  parade → 404 before opening the stream).
- **Out of scope:** WebSockets.

##### B31 · Expose the parade's progress by waypoints

- **To understand:** with the whole history of the head you can tell at what time it went
  past each reference point ("pasó por Cristo Rey a las 3:40"). It is what the web shows
  when the parade has already passed where you are.
- **What:** `app/domain/progress.py` with `waypoint_passes` (port of `pasosPorHito` in
  `src/lib/recorrido.ts`) and `GET /api/parades/{id}/progress` → `{parade, passes}`, same
  `Cache-Control`.
- **Tests:** `test_waypoint_passes_ok`, `test_waypoint_passes_fails` (empty history → no
  passes) and **specific**: `test_waypoint_not_reached_does_not_appear`.
#### #29 · M4 · `feat(back)`: add the crowd density map

- **To understand:** the public's phones say, anonymously, where they are along the course,
  and the server answers how full each stretch is.
- **Depends on:** #18 (M2)
- **Parts:** B32, B33, B34, built in that order and delivered in a single commit. It
  replaces the former issues #44, #30, closed in favour of this one.
- **Acceptance:** `just check` and `just test` pass, and `just db-test` if a migration
  changed. Every part below is in.

##### B32 · Port the density calculation by stretches

- **To understand:** the course is split into 100 m stretches and the phones in each one
  are counted. The README's safeguards stay: with fewer than 50 users nothing is painted,
  and a stretch with fewer than 3 reports is left without data (which is not the same as
  empty).
- **What:** `app/domain/density.py` and `app/domain/constants.py` with the same constants
  and rules as `src/lib/densidad.ts` and `src/lib/tipos.ts`. Each constant with a comment
  pointing to the TS file it comes from: if one changes, the other changes.
- **Tests:** `test_classify_ok` (60 users → bins with levels), `test_classify_fails` (40
  users → `enough=False`) and **specific**: `test_stretch_with_few_samples_does_not_appear`.

##### B33 · Issue signed device ids

- **To understand:** the crowd map and photos count devices. If the phone made up its own
  id, a script could send a thousand and paint a stretch "full". That is why the server
  issues the id, signed with HMAC, and issuing has a cap per IP. It is anonymous: it says
  nothing about the person.
- **What:** `POST /api/device` → `{device}` or 429; `issue_device` and `valid_device`
  (port of `src/lib/sesion.ts`, signed with a key derived from `JWT_SECRET`); cap of 300
  per IP per hour in `app/rate_limits.py`.
- **Tests:** `test_valid_device_ok`, `test_valid_device_fails` (tampered signature →
  `None`) and **specific**: `test_issuing_301_from_the_same_ip_is_429`.

##### B34 · Receive and aggregate the crowd at /api/density

- **To understand:** the `POST` is anonymous (any phone with an issued id contributes its
  stretch) and the `GET` returns only the aggregate, never raw rows, so nobody can
  reconstruct where a device went.
- **What:** port of `src/app/api/densidad/route.ts`, always on the current parade. `POST
  {device, bin}`: invalid device → 401 (the client asks for a new one); upsert by device;
  deletes presences outside the window in the same `POST` (no cron).
- **Tests:** `test_density_post_ok`, `test_density_post_fails` (`bin` off the course →
  400) and **specific**: `test_same_device_counts_once`.
---

### Phase 5 — Content and community

#### #45 · M5 · `feat(back)`: add announcements and schedule events

- **To understand:** the two things the team writes for everyone to read: announcements on
  parade day and the events of the schedule.
- **Depends on:** #16 (M1), #18 (M2)
- **Parts:** B35, B36, built in that order and delivered in a single commit. It replaces the
  former issues #46, closed in favour of this one.
- **Acceptance:** `just check` and `just test` pass, and `just db-test` if a migration
  changed. Every part below is in.

##### B35 · Publish team announcements for everyone

- **To understand:** an announcement is a message from the team that shows above the map
  ("arranca con 40 min de retraso"). It travels inside the parade state, so on publishing
  it the stream has to be notified for it to arrive instantly.
- **What:** table `announcements` (migration), repository, `GET/POST
  /api/admin/announcements` and `DELETE /api/admin/announcements/{id}`
  (`announcements:manage`, validation of `validarAviso`). The current ones are included in
  `ParadeState.announcements`; publishing or deleting issues `NOTIFY`.
- **Tests:** `test_publish_announcement_ok`, `test_publish_announcement_fails` (empty text
  → 400) and **specific**: `test_expired_announcement_is_not_in_the_state`.

##### B36 · Manage the schedule's events

- **To understand:** besides the parades, the schedule has stages, *tascas* and cultural
  events. They are loaded from the panel and show in the web's "Hoy" tab.
- **What:** table `events` (migration, without `anunciante_id`), repository, seeding from
  `seed/events.json`, `GET/PUT/DELETE /api/admin/events` (`schedule:edit`, validation of
  `validarEvento`), and `GET /api/schedule` starts including them.
- **Tests:** `test_save_event_ok`, `test_save_event_fails` (invalid category → 400).
#### #47 · M6 · `feat(back)`: add businesses and their metrics

- **To understand:** the businesses and services on the map, and the count of how much
  people interact with each one.
- **Depends on:** #16 (M1)
- **Parts:** B37, B38, built in that order and delivered in a single commit. It replaces the
  former issues #48, closed in favour of this one.
- **Acceptance:** `just check` and `just test` pass, and `just db-test` if a migration
  changed. Every part below is in.

##### B37 · Manage the map's businesses and services

- **To understand:** the businesses layer brings together shops and services (toilets,
  water). Appearing on the map never depends on paying; the plan only gives the offer, the
  menu and the links (see README, "Businesses on the map"). The public only sees the
  visible ones.
- **What:** table `businesses` (migration), repository, seeding from
  `seed/businesses.json`, `GET /api/businesses` (only visible ones, same `Cache-Control`)
  and `GET/PUT/DELETE /api/admin/businesses` (`businesses:edit`), port of
  `validarComercio` (`src/lib/comercios.ts`).
- **Tests:** `test_save_business_ok`, `test_save_business_fails` (lat out of range → 400)
  and **specific**: `test_service_never_has_plan_or_offer`.

##### B38 · Count interactions with businesses

- **To understand:** the advertiser is shown how many times their card was opened or their
  WhatsApp tapped. Only a counter is incremented: who it was or from where is not stored.
  The counter failing cannot break the map for anyone.
- **What:** table `business_metrics` (migration), `POST /api/businesses/event` (always
  `{ok: true}`, even if it fails inside) and the metrics in `GET /api/admin/businesses`
  (`metrics:view`), as today.
- **Tests:** `test_add_metric_ok`, `test_add_metric_fails` (invalid type → 400).
#### #49 · M7 · `feat(back)`: add the public's photos and their moderation

- **To understand:** people upload photos, they are stored on disk or on S3, and nothing is
  shown until a moderator approves it.
- **Depends on:** #16 (M1), #29 (M4)
- **Parts:** B39, B40, B41, built in that order and delivered in a single commit. It
  replaces the former issues #50, #51, closed in favour of this one.
- **Acceptance:** `just check` and `just test` pass, and `just db-test` if a migration
  changed. Every part below is in.

##### B39 · Store photos on disk or on S3

- **To understand:** photos do not go in the database: they go in file storage. In
  development, a folder; in production, an S3 bucket (the standard Railway, Cloudflare R2
  and AWS use). A common interface lets you swap one for the other with an environment
  variable.
- **What:** `app/storage.py` with a `Protocol` (`save`, `read`, `delete`), `DiskStorage`
  and `S3Storage` (`boto3`), chosen by whether `S3_BUCKET` exists.
- **Tests (with disk in `tmp_path`):** `test_save_and_read_ok`, `test_read_fails` (missing
  id → `None`).
- **Out of scope:** creating the bucket (B48, in M9).

##### B40 · Receive and show the public's photos

- **To understand:** anyone can upload a photo, but it stays **pending**: nothing is
  published without moderation. A device id is required, it is limited to 8 per hour, and
  the file is checked to really be a JPEG (its first three bytes), without trusting what
  the browser says.
- **What:** table `photos` (migration, `storage_path`), repository, port of
  `src/app/api/fotos/route.ts` and `fotos/[id]/route.ts`: multipart `POST` (device, maximum
  size 1.5 MB, JPEG, optional `metres`), `GET` approved ones, `GET /{id}` serves the image
  (pending or rejected → 404 unless with `photos:moderate`). States: `pending`,
  `approved`, `rejected`.
- **Tests:** `test_upload_photo_ok`, `test_upload_photo_fails` (PNG → 415) and
  **specific**: `test_pending_photo_is_not_public`.

##### B41 · Moderate photos

- **To understand:** inappropriate content under the Carnival's name is a reputational
  problem, not a detail. Whoever has the `moderator` role approves, rejects or deletes.
- **What:** `GET /api/admin/photos` (pending first), `PATCH /{id}` with `{state}` and
  `DELETE /{id}` (also deletes the file), with `photos:moderate`.
- **Tests:** `test_moderate_photo_ok`, `test_moderate_photo_fails` (reporter → 403).
#### #52 · M8 · `feat(back)`: add push notifications

- **To understand:** whoever asked for it gets a notification on their phone when the parade
  is getting close to where they wait.
- **Depends on:** #23 (M3)
- **Parts:** B42, B43, built in that order and delivered in a single commit. It replaces the
  former issues #53, closed in favour of this one.
- **Acceptance:** `just check` and `just test` pass, and `just db-test` if a migration
  changed. Every part below is in.

##### B42 · Store push notification subscriptions

- **To understand:** "avisame cuando el desfile esté cerca". The browser hands over a
  *subscription* (where to send the notification and with which keys) and the person says
  at which metre of the course they are waiting. Nothing else: no name, no account.
- **What:** table `push_subscriptions` (migration), repository, port of
  `src/app/api/avisos-push/route.ts` at `/api/push-subscriptions`: `GET` (configured, and
  the public key), `POST` (validations and `thresholdMin` bounded to 5–60), `DELETE`.
- **Tests:** `test_subscribe_ok`, `test_subscribe_fails` (endpoint without `https://` →
  400).

##### B43 · Notify whoever is waiting when the parade gets close

- **To understand:** every time a position of the head arrives, it is checked who has
  little time left, they are sent the notification with web push and their subscription is
  deleted (one notification per request). To know how long is left the parade's speed is
  needed, so `estimarVelocidad` from `src/lib/eta.ts` is ported. A failure sending
  notifications cannot bring down ingestion.
- **What:** `app/domain/eta.py` with `estimate_speed` (exact port, same constants),
  `app/push.py` with `notify_nearby(state)` (at most one check every 15 s per parade,
  `pywebpush`, in the background with `BackgroundTasks`), called from
  `POST /api/positions` when the head comes in.
- **Tests:** `test_estimate_speed_ok`, `test_estimate_speed_fails` (less than 90 s of
  history → nominal speed) and **specific**: `test_stopped_parade_does_not_notify`.
---

### Phase 6 — Deployment

#### #32 · B45 · `chore(back)`: package the backend in a Dockerfile

- **To understand:** a Docker image is the backend with everything it needs to run,
  packaged. Railway downloads that image and runs it. "Multi-stage" means everything is
  installed in one stage and only what is needed goes to the final image, so it weighs
  less.
- **Depends on:** #52 (M8)
- **What:** multi-stage `backend/Dockerfile` with uv's official image (`uv sync --frozen
  --no-dev`), copies `app/`, `migrations/`, `seed/`, `alembic.ini`; non-root user;
  `CMD fastapi run --host 0.0.0.0 --port ${PORT}`. `.dockerignore`.
- **Acceptance:** `docker build backend/` works and the container answers `/api/health`.

#### #33 · M9 · `chore(infra)`: deploy the backend on Railway with Terraform

- **To understand:** the whole production infrastructure described in files: the Railway
  project, its Postgres, the photos bucket and the API service with its secrets.
- **Depends on:** #32 (B45), #49 (M7)
- **Parts:** B46, B47, B48, B49, built in that order and delivered in a single commit. It
  replaces the former issues #34, #54, #35, closed in favour of this one.
- **Acceptance:** every part below is in; the manual steps are listed in the PR for the
  maintainer.

##### B46 · Start Terraform with the Railway provider

- **To understand:** Terraform describes infrastructure in files (`.tf`): "I want a
  project on Railway with this service and these variables". `terraform plan` shows what
  would change and `apply` does it. The **state** is a file where Terraform remembers what
  it created; it has to live somewhere shared so your machine and CI see the same.
- **Needs the maintainer:** **decide where the state lives** (recommended: HCP Terraform,
  free plan; alternative: S3/R2 bucket). The agent leaves the recommended option marked.
- **What:** `infra/` with `versions.tf` (`terraform-community-providers/railway`,
  `carlpett/sops`, pinned versions), `providers.tf`, `main.tf` with `railway_project` and
  the `production` environment, `.terraform.lock.hcl`. `tflint` in pre-commit.
- **Acceptance:** `terraform init && terraform validate` pass.

##### B47 · Create Postgres on Railway

- **To understand:** the production database is also a service on Railway, with a volume
  (disk) so data survives restarts.
- **What:** **first investigate** whether the provider allows creating Postgres with a
  persistent volume (service with image `ghcr.io/railwayapp-templates/postgres-ssl` +
  volume).
  - If it does: in Terraform, with `DATABASE_URL` as a sensitive output.
  - If it does not: document in `infra/README.md` how to create it from the panel and take
    its `DATABASE_URL` as an input variable. Do not invent resources the provider does not
    have.
- **Acceptance:** `terraform plan` without errors; the decision is written in the PR.

##### B48 · Create the photos bucket

- **To understand:** B39's S3 storage needs a real bucket in production, with its URL and
  its access keys, which reach the backend as variables.
- **Needs the maintainer:** if it cannot be done on Railway, create the bucket on
  Cloudflare R2 and store the keys in `secrets/prod.enc.yaml`.
- **What:** **first investigate** whether Railway offers S3 buckets and whether the
  provider supports them. If so, in Terraform with its credentials as sensitive outputs;
  if not, document R2 in `infra/README.md` and take the four `S3_*` variables from sops.
  The bucket is **private**.
- **Acceptance:** `terraform plan` without errors; the decision is written in the PR.

##### B49 · Deploy the API service with secrets from sops

- **To understand:** here the pieces come together: Terraform tells Railway which image to
  run, reads the secrets from `prod.enc.yaml` with sops and passes them to the service as
  environment variables, the same ones `config.py` reads.
- **What:** `railway_service` with `source_image =
  "ghcr.io/<org>/sigue-el-desfile-backend:${var.image_tag}"`, one replica, pre-deploy
  `alembic upgrade head`, healthcheck on `/api/health`, Railway domain. Variables of B06
  from `data "sops_file"` and those of Postgres and the bucket.
- **Acceptance:** `terraform plan -var image_tag=<sha>` shows the service with sensitive
  variables.
#### #36 · B50 · `chore(ci)`: publish the image and apply Terraform on merge

- **To understand:** it is CD (continuous deployment): on merging to `trunk`, GitHub
  builds the image, pushes it to GHCR (GitHub's image registry) and runs `terraform apply`
  so Railway uses the new one. The `production` environment with manual approval means
  nothing goes out without you authorising it.
- **Depends on:** B05, #33 (M9)
- **Needs the maintainer:** create a key pair for CI, add its public key to `.sops.yaml`
  and run `sops updatekeys`; create the secrets `SOPS_AGE_KEY` and `RAILWAY_TOKEN` and the
  `production` environment with manual approval.
- **What:** `.github/workflows/backend-cd.yml`:
  - PR that touches `infra/**`: `terraform fmt -check`, `validate` and `plan` commented on
    the PR.
  - Push to `trunk` that touches `backend/**` or `infra/**`: build and push to GHCR (tag =
    SHA) and `terraform apply -var image_tag=$SHA` in `production`.
- **Acceptance:** a merge deploys and `/api/health` answers on the Railway domain.

---

### Phase 7 — Connect the web and document

The web is written in Spanish and the backend's contract is English. These issues map
between the two in the web's `api` adapter; renaming the web itself is a separate, later
effort.

#### #37 · B51 · `feat(datos)`: move the web's public reads to the backend

- **To understand:** the web already knows how to talk to two data sources (`local` and
  `supabase`). `api` is added: the public screens ask `NEXT_PUBLIC_API_URL` for everything
  instead of Next's own `/api`. The adapter translates the backend's English routes, keys
  and values to the web's existing types (`src/lib/tipos.ts`), so screens do not change.
- **Depends on:** B50
- **What:** `NEXT_PUBLIC_DATOS=api` + `NEXT_PUBLIC_API_URL`. The public hooks and screens
  (state and stream, density, device, schedule, businesses and their event, photos,
  progress, push subscriptions) use a function `urlApi(route)` that respects the mode, and
  a mapping layer between the English contract and the web's types. The service worker
  also caches the backend's responses. `local` and `supabase` are not touched.
- **Acceptance:** with the local backend, `npm run dev` in `api` mode shows the backend's
  parade, schedule and businesses.
- **Tests:** `npm run typecheck` and `npm test` pass; a test of `urlApi` (ok and without
  `NEXT_PUBLIC_API_URL`) and one of the mapping of a parade state.

#### #55 · B52 · `feat(ui)`: log in with email and password in the panels

- **To understand:** the admin and reporter panels log in today with a single password and
  with a code. In `api` mode they move to a single login with email and password; the
  token is kept in the browser and sent as `Bearer`. Each panel shows only what the user's
  permissions allow.
- **Depends on:** B51
- **What:** common login screen, API client with the token, panels that read `permissions`
  from `/api/auth/me`; managing reporters becomes managing users with roles and post. The
  reporter's send queue (`useReporte`) sends the token.
- **Acceptance:** an admin creates a reporter from the panel, the reporter logs in and
  their positions move the parade.
- **Tests:** `npm run typecheck` and `npm test` pass.
- **Out of scope:** removing the `local` and `supabase` modes.

#### #56 · B53 · `feat(simulacion)`: make the simulator log in with an ingest user

- **To understand:** the simulator sends positions of the three posts, so it logs in with
  a service account with the `ingest` role instead of with `INGESTA_TOKEN`.
- **Depends on:** B51
- **What:** `scripts/simular-desfile.ts` accepts `--email` and `--password` (or
  environment variables), logs in and sends `Authorization: Bearer`, using the backend's
  English routes and keys. `python -m app.cli seed --dev` creates a user `simulator@local`
  with the `ingest` role (only with `ENVIRONMENT=dev`).
- **Acceptance:** `npm run simular -- --url=http://localhost:8000 --email=...
  --password=...`
  moves the parade.

#### #38 · B54 · `docs(back)`: document how to run, test and deploy the backend

- **To understand:** it closes the loop: someone new can bring everything up by reading a
  single file.
- **Depends on:** B52, B53
- **What:** `backend/README.md` (Nix, `just`, local database, sops, tests, creating an
  admin, seeding, deploying). In the root `README.md`, update the sections on the data
  adapters and on going to production. In `CLAUDE.md`, move the backend commands from
  "when it exists" to real.

---

## 3. Order and dependencies

The main path is linear, one module at a time:

```
Phase 0-1  B01 → B02 → B03 → B04 → B05 → B06 → B44 → B07 → B08 → #66 → #69 → #67
Phase 2    B09 → B10 → B11 → B12 → B13 → M1 (B14–B17)
Phase 3    M2 (B18–B23)
Phase 4    M3 (B24–B31) → M4 (B32–B34)
Phase 5    M5 (B35–B36) → M6 (B37–B38) → M7 (B39–B41) → M8 (B42–B43)
Phase 6    B45 → M9 (B46–B49) → B50
Phase 7    B51 → B52 → B53 → B54
```

The real dependencies (`Depends on`) are looser: if work has to go in parallel, M5, M6 and
M7 are independent of each other, and M4 does not need M3.

## 4. Outside this plan

So they are not lost, but they are **not** done now: password recovery by email, refresh
tokens, rate limits shared between replicas, staging, observability, integration tests
against Postgres in CI, advertisers and promotions, removing the `local` and `supabase`
adapters, renaming the web app (`src/`) to English, rebuilding the web's CI workflow, the
mobile app.
