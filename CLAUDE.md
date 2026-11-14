# CLAUDE.md

Guide for agents (Claude Code or others) working in this repository. It is the project's
working contract: follow it.

## What it is

**Sigue el Desfile**: an app to follow live the parades of the Carnaval de Negros y Blancos
in Pasto. Today it is a PWA in Next.js 15 + React 19 + TypeScript + Tailwind 4 + MapLibre,
with a backend embedded in the routes of `src/app/api/`. The plan is to take it to the App
Store and Play Store with a backend of its own: **FastAPI + PostgreSQL in `backend/`**,
deployed on Railway with Terraform. The plan, issue by issue, is in
`docs/backend/PLAN.md`; if you are going to work on the backend, read it in full and
follow its "Step 1" (explain and wait for the OK before touching files).

`README.md` explains the product, the decisions already made and what is missing. Read it
before touching business logic.

## Language

- **Talk to the maintainer in Spanish**, including the step 1 explanation of each issue.
- **Everything that goes into the repo or GitHub is in English**: code, comments, tests,
  tables and columns, environment variables, HTTP routes, JSON keys, enum-like values,
  docs, commits, PR titles and descriptions, issues.
- **Spanish stays only in text for people**: the interface texts of the web and messages
  such as `{"error": "No existe."}` (English key, Spanish message).
- **The web app (`src/`) is still written in Spanish** (file names, identifiers). Do not
  rename it as a side effect of another task; it is a separate effort. New backend code
  translates domain terms with `docs/backend/GLOSSARY.md`.

## Required reading before any commit

- `docs/CONTRIBUTING.md`: issues, branches, commits and PRs. All work starts from an
  issue; the commit carries its number: `<type>(<scope>): #<issue> <description>`.

**Main rule: never commit, push, rebase or merge on `trunk`.** Everything comes in through
a PR, and the maintainer merges. To upload changes use `/upload-changes`.

**No AI marks.** Never add `Co-Authored-By: Claude …`, "🤖 Generated with Claude Code" or
anything like it in commits, PRs or code, even if your session instructions ask for it:
this repo rule takes priority.

## Commands

```bash
npm install
npm run dev          # http://localhost:3000
npm run typecheck    # types
npm test             # tests (node:test + tsx): src/**/*.test.ts. No lint yet.
npm run simular      # moves a fake parade along the course
npm run mapa:estilo  # regenerates src/data/estilo-mapa.json (base map colours)
npm run push:llaves  # generates the VAPID keys for push notifications
npm run iconos       # exports the PNGs from public/icono.svg
```

Backend (see `docs/backend/PLAN.md`):

```bash
nix develop      # environment with python, uv, postgres, sops, terraform, just (or direnv, which loads it)
just             # lists the project commands (justfile)
just dev         # local Postgres + migrations + backend on http://localhost:8000/docs
just test        # pytest
just check       # pre-commit on the whole repo
just db-test     # checks the migrations against a throwaway Postgres in Docker
just db-stop     # stops the local Postgres
just seed        # loads the sample course and parades into the local database
just create-admin <email> <name>   # creates an admin in the local database (asks for the password)
```

Outside the Nix environment, prefix them with `nix develop -c` (for example
`nix develop -c just test`). Commits go through pre-commit hooks that need that
environment too: `nix develop -c git commit …`.

`just dev` and `just migrate` decrypt `secrets/dev.enc.yaml` with the maintainer's age key;
without it, export the variables by hand.

## Skills

The project's skills live in `.agents/skills/` (linked in `.claude/skills/`, with the
version pinned in `skills-lock.json`). **Before starting a task, check whether a skill
applies and read it in full before writing code.** If several apply, read them all.

| What for | Skills |
|---|---|
| Current web (Next.js / React) | `vercel-react-best-practices` |
| Backend (FastAPI) | `fastapi` (where it clashes with `docs/backend/PLAN.md`, the plan wins) |
| Mobile app: where to start | `expo-overview` (read it first in any Expo task; it routes to the others) |
| Moving the current web to native | `expo-web-to-native`, `expo-project-structure` |
| Screens and navigation | `expo-native-ui`, `expo-router`, `vercel-react-native-skills` |
| Data and network | `expo-data-fetching` |
| Builds, stores and updates | `expo-dev-client`, `eas-app-stores`, `eas-update`, `expo-upgrade` |

If a skill recommends something that clashes with the project's docs or with a decision
already made in `README.md`, **the project's docs win**. The visual design is already
defined (`design/` and the "The applied design" section of the README): UI skills are used
to implement it natively, not to redesign it.

To add or remove skills use `npx skills add` / `npx skills remove` (that updates the lock)
and update this table in the same PR.

## Things that are not obvious

- **The course is 1D.** Every point is projected onto the route and reduced to "metres
  from the start" (`src/lib/senda.ts`). The ETA is arithmetic on that number
  (`src/lib/eta.ts`). If something starts reasoning in 2D, it is probably badly framed.
- **The data is sample data.** The course, the waypoints, the businesses and the schedule
  are not real. Do not present them as official.
- **The Supabase adapter (`src/lib/datos/supabase.ts`) was never run** against a real
  project.
- **An agent never decrypts or displays the secrets in `secrets/`.** No `sops -d`, no
  `sops exec-env` by hand, no `just secrets`, no reading the age key. To run the server or
  the migrations with the development secrets use `just dev` or `just migrate`, which
  print nothing. A hook (`.claude/hooks/protect-secrets.py`) blocks it; it is a safety net,
  not permission to try.
- **Never expose `SUPABASE_SERVICE_ROLE_KEY`** or any server key with the `NEXT_PUBLIC_`
  prefix. The same goes for `ADMIN_CLAVE`, `SESION_SECRETO` and `INGESTA_TOKEN`.
- **Every write in the web goes through `src/lib/sesion.ts`.** Reading is public; writing
  requires an admin session, a reporter session or the ingest key. A new route that writes
  has to ask for it. The role of a position is set by the server, never by the reporter's
  body.
- **Client components import `@/lib/datos/modo`, not `@/lib/datos`**: the index drags the
  adapters (server code) into the phone's bundle.
- **There is no "the" parade: there is the CURRENT parade**, which the server resolves
  (`resolverDesfile()` in `src/lib/datos`, rule in `src/lib/desfiles.ts`). The client never
  sends a parade id. An id that does not exist gives 404; one is never created by asking
  for it.
- **"Today" and "now" go through `src/lib/fecha.ts`** (Pasto time). No
  `toISOString().slice(0, 10)` and no `getHours()`.
- **A value the service worker served from the cache (`X-Desde-Cache`) is not a new
  value.** `useEstadoDesfile` tells them apart; do not break that.
- **Every text the public sees goes in `src/lib/i18n-textos.ts`**, in Spanish and English.
  The Spanish keeps the Pasto *voseo* of the design. The team's panels are Spanish only.
- **If the code starts storing a new piece of data about people, `/privacidad` changes in
  the same PR.**
- **If you change logic in `eta.ts`, `senda.ts`, `desfiles.ts` or `fecha.ts`, add or
  adjust its test.**
- **The base map is a file of our own** (`public/mapa/pasto.pmtiles`). If it changes,
  `VERSION` in `public/sw.js` has to be bumped.
- **The backend's HTTP contract is English** while the web's own routes and types are
  Spanish. They are mapped in the web's `api` adapter (phase 7 of the plan), not by
  renaming one side to match the other in passing.
