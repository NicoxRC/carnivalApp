# Backend architecture

The decisions behind `apps/backend/`, already made. If something does not convince you,
open it as a discussion in a PR; do not change it silently. The English name of each domain
term, shared by the web and the backend, is in `GLOSSARY.md`.

Stack: **FastAPI + PostgreSQL**, environment with **Nix**, dependencies with **uv**, secrets
with **sops + age**, **pre-commit**, **unit tests with pytest**, **CI/CD on GitHub Actions**
and deployment with **Terraform on Railway**.

## Monorepo

```
flake.nix                  development environment (root: used by back, infra and CI)
justfile                   project commands (`just dev`, `just test`…)
docker-compose.yml         throwaway Postgres for `just db-test`
.pre-commit-config.yaml
.sops.yaml
secrets/                   *.enc.yaml encrypted with sops (never plain text)
apps/web/                  the Next.js PWA
apps/backend/
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

## The HTTP contract

The backend exposes the resources the web's former embedded API (`src/app/api/`, removed
in #88) had, **with the same behaviour, named in English**: routes, JSON keys (camelCase)
and enum-like values. The web uses those names and values as they are; `apps/web/src/lib/api/`
only checks the shape of what arrives.

| Route | Access |
|---|---|
| `GET /api/health` | public |
| `POST /api/auth/login`, `GET /api/auth/me` | public / session |
| `GET /api/admin/users`, `POST/PATCH/DELETE /api/admin/users` | `users:view` / `users:manage` |
| `GET /api/course` | public |
| `GET /api/schedule` | public |
| `GET/PUT/PATCH/DELETE /api/admin/parades` | `parades:*` |
| `POST /api/positions` | `positions:*` |
| `GET /api/state` | public |
| `GET /api/state/stream` | public |
| `GET /api/parades/{id}/progress` | public |
| `POST /api/device` | public, rate-limited by IP |
| `GET/POST /api/density` | public / device |
| `GET/POST/DELETE /api/admin/announcements` | `announcements:manage` |
| `GET/PUT/DELETE /api/admin/events` | `schedule:edit` |
| `GET /api/businesses`, `GET/PUT/DELETE /api/admin/businesses` | public / `businesses:edit` |
| `POST /api/businesses/event`, metrics in admin | public / `metrics:view` |
| `GET /api/photos`, `GET /api/photos/{id}` | public (approved only) |
| `POST /api/photos/uploads`, `PUT /api/photos/uploads/{id}` (only without a bucket), `POST /api/photos/uploads/{id}/done` | device |
| `GET/PATCH/DELETE /api/admin/photos` | `photos:moderate` |
| `GET/POST/DELETE /api/push-subscriptions` | public |
| ~~web's former `POST /api/simulacion`~~ | **not ported**: the simulator is `npm run simulate` with an `ingest` user |

- Errors: always `{"error": "<message in Spanish>"}` with the right HTTP status. Validation
  errors answer **400**, as the web's API did, not FastAPI's 422.
- Pydantic: `model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)`;
  responses go out `by_alias=True`. Python attributes are snake_case, JSON keys camelCase.
- **There is no "the" parade: there is the CURRENT parade.** The
  server resolves it; the public client does not send an id. An id that does not exist
  gives 404; a parade is never created because someone asked for it.
- **"Today" and "now" are Pasto time** (`America/Bogota`), as in `apps/web/src/lib/dates.ts`.

## Users, roles and permissions

- **The public has no account.** Watching the parade, contributing to the crowd map,
  uploading photos and asking for notifications stay anonymous (with the signed device id
  where it is used).
- **The team does:** login with **email and password**. It replaces the single admin
  password, the reporter codes and the ingest token the web used to have.
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
  `Authorization: Bearer <token>`. It lasts 20 h (a whole parade day). No refresh tokens. The token carries only the user id: roles and `active`
  are read from the database on every request, so deactivating someone cuts their session
  instantly.
- **Bearer and not cookies:** the mobile app does not handle cookies well and the backend
  lives on a different domain than the web. The price: the web keeps the token in the
  browser; it is mitigated with the web's CSP and the short duration.
- **Brute-force brake** on login: growing wait per IP (up to 5 s), without blocking.
- The first admin is created from the console (`python -m app.cli create-admin`).

## The course is still 1D

- Projecting lat/lng to "metres from the start" is done **in Python** with `shapely` on the
  course reprojected with `pyproj` to a flat plane in metres centred on the course. No
  PostGIS. The plane is built on a sphere of turf's radius and not on UTM 18N: UTM measures
  on the ellipsoid and came out 11 m short of turf at the end of the course.
- It is computed **once on insert** and stored in `positions.course_m`.
- The course is stored in the `courses` table (GeoJSON) and loaded in memory at startup.
- Parity with the web: a fixture exported with turf (`apps/backend/seed/projections.json`)
  guarantees Python and TypeScript give the same number (±2 m).
- **The ETA the user sees is still computed on the client** (`apps/web/src/lib/eta.ts`). The backend
  only ports `estimateSpeed` because it needs it for push notifications.

## Database

- PostgreSQL 16. SQLAlchemy 2 async + asyncpg. Migrations with Alembic, named with a short
  sequential number: `0001_users.py`, `0002_…`.
- The schema starts from the web's former `supabase/schema.sql` (removed in #88), **without** what belongs to Supabase
  (`auth.users`, RLS, `supabase_realtime`, `storage.buckets`) and with tables and columns in
  English. `reporteros` is replaced by `users`. The tables `anunciantes` and `promociones`
  are **not** ported (nothing uses them).
- Enum-like columns are `text` with a `check` constraint, not Postgres `ENUM` types.
- Positions: `ts` (device time) and `received_at` (server clock) are stored. The "latest
  position" of each post is the one with the **highest `ts`**.
- **Restarting a parade does not delete rows** (the web's former API deleted them): `parades.run_started_at` is stored and reads ignore whatever is older. A
  restart by mistake on December 31 cannot destroy data.

## Real time

- FastAPI's native SSE: `response_class=EventSourceResponse` (`fastapi.sse`) and `yield`.
  Heartbeat every 20 s.
- Every insert into `positions`, state change or new announcement does
  `NOTIFY parade_changes, '<parade id>'`. Each server keeps one dedicated asyncpg
  connection in `LISTEN` and wakes up its open streams of that parade, which send the
  snapshot. One channel with the id as payload, not one channel per parade: a single
  `LISTEN` per process. It works the same with one replica or several.

## Rate limits

The limits (device issuing per IP, photos per device, login) live in process memory. That
is fine because Railway runs **a single replica**. If it scales to several, they have to
move to Postgres. The IP comes from the
header Railway sets (`X-Real-IP` / last hop of `X-Forwarded-For`), never from the first hop.

## Photos and push

- **Photos live on Cloudflare R2** (S3-compatible, `boto3`): 10 GB free and no charge for
  downloads, which is what parade day spends. Without a bucket (development, tests) they go to
  disk (`apps/backend/.photos/`).
- **The phone uploads straight to the bucket**, so the files do not go through our server:
  1. `POST /api/photos/uploads` `{device, size}` checks the device, the per-device cap and the
     size, and answers a signed `PUT` URL (path, type and exact size fixed; 5 min) plus a
     signed token with the photo id, the device, the size and the expiry.
  2. The phone `PUT`s the JPEG to that URL. It lands in `incoming/`.
  3. `POST /api/photos/uploads/{id}/done` `{token, metres}` checks that the file arrived, its
     size and its first bytes (a JPEG), moves it to `photos/` and only then creates the row,
     pending. A file that fails is deleted; one never confirmed is deleted by a bucket rule.
  No table holds unfinished uploads: the token is enough. Without a bucket, the upload URL is
  `PUT /api/photos/uploads/{id}?token=…` on the API itself.
- **The bucket is private.** Photo URLs are signed and expire after an hour; only approved
  photos get one in public, and only a moderator gets one for a pending photo (the admin list
  is behind a login). `GET /api/photos/{id}` keeps those checks and redirects to a signed URL,
  or serves the file when there is no bucket.
- **What the bucket needs** (one per environment): private, with no public access or custom
  domain; CORS allowing `PUT` and `GET` with the `content-type` header from the web's
  origins; a lifecycle rule deleting `incoming/` after one day; an API token limited to that
  bucket with read and write. Its values go into the secrets as `S3_*`.
- **Push:** `pywebpush` with VAPID keys (the same ones `npm run push:keys` generates).
  Without keys, the feature turns itself off.

## Secrets

- `sops` + `age`. Files `secrets/dev.enc.yaml` and `secrets/prod.enc.yaml`, one rule per
  file in `.sops.yaml` so different people can have access to each.
- There is no `apps/backend/.env`: configuration comes only from environment variables, and
  locally `sops exec-env` sets them (wrapped by `just dev` and `just migrate`).
- In Terraform: the `carlpett/sops` provider reads `prod.enc.yaml` and writes it as service
  variables on Railway. Railway never receives an age key.
- In GitHub Actions only `SOPS_AGE_KEY` (a key pair of its own for CI) and `RAILWAY_TOKEN`
  exist.
- A pre-commit hook rejects any unencrypted file in `secrets/`. A Claude Code hook
  (`.claude/hooks/protect-secrets.py`) stops agents from decrypting.

## Deployment and dependencies

- Railway, provider `terraform-community-providers/railway`, a single environment
  (`production`), one replica.
- Image built in CI with the `Dockerfile` in `apps/backend/`, published to GHCR with the commit
  SHA. Migrations in the pre-deploy step (`alembic upgrade head`).

| Use | Python 3.12 packages |
|---|---|
| App | `fastapi[standard]`, `pydantic-settings`, `sqlalchemy[asyncio]`, `asyncpg`, `alembic`, `pwdlib[argon2]`, `pyjwt`, `shapely`, `pyproj`, `boto3`, `pywebpush` |
| Dev | `pytest`, `pytest-asyncio`, `httpx`, `ruff`, `mypy` |

Do not add dependencies outside this table without saying so in the PR.

## Where the backend departs from the `fastapi` skill

- **SQLAlchemy 2 async instead of SQLModel.** The app is async (SSE, LISTEN/NOTIFY) and
  SQLModel's async support is a step behind. HTTP schemas are Pydantic models separate from
  the tables.
- **mypy instead of ty.** mypy `--strict` is what the team already uses.
- **Railway, not FastAPI Cloud** (decision of this iteration).

Everything else in the skill applies: `Annotated` with type aliases for dependencies, return
types instead of `response_model` when possible, prefix, tags and dependencies on the
`APIRouter`, one function per HTTP operation, no `...` as a default and no `RootModel`, and
`def` instead of `async def` when what is inside blocks (Argon2, shapely, boto3).
