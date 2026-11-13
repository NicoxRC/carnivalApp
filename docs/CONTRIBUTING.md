# How to contribute

How branches are created, commits are made and code is integrated in this repository. It
applies equally to people and to AI agents. If you are an agent, this document is
mandatory: read it in full before creating a branch or making a commit.

> Shortcut for agents in Claude Code: the `/upload-changes` command follows this document
> step by step to upload whatever changes you have (branch → commits → push → PR).

---

## Language

- **English:** code, comments, docs, commit messages, PR titles and descriptions, issues.
- **Spanish:** text shown to people (interface texts, error messages) and the conversation
  between the maintainer and the agent.
- The web app (`src/`) is still written in Spanish and keeps its names until it is renamed
  in its own effort; new backend code follows `docs/backend/GLOSSARY.md`.

---

## The rule that is never broken: nobody touches `trunk`

`trunk` is the only long-lived branch and always has to be deployable.

- **Committing to `trunk` is forbidden.** Not even for a one-line change.
- **Pushing to `trunk` is forbidden.** Everything comes in through a Pull Request.
- **Force-pushing, rebasing or resetting `trunk` is forbidden.**
- **Merging a PR without the maintainer's explicit approval is forbidden.** An agent opens
  the PR and stops there; it never runs `gh pr merge`.

If you realise you are on `trunk` with uncommitted changes, do not commit: create the
branch first (`git switch -c <type>/<description>`). Uncommitted changes move with you to
the new branch.

In Claude Code, a hook (`.claude/hooks/protect-trunk.py`) blocks commits and pushes made
from `trunk` or to `trunk`. It is a safety net, not permission to try.

---

## Branches — GitHub Flow

A single long-lived branch (`trunk`) and short working branches that come off it. There is
no `develop` and there are no release branches.

```
trunk
 ├── feature/14-asymmetric-eta-range
 ├── fix/21-course-projection-off-route
 └── chore/30-update-maplibre
```

1. **All work starts from a GitHub issue.** If there is no issue, it is created before the
   branch. One issue = one branch = one PR.
2. All work starts on a new branch created from an up-to-date `trunk`.
3. Branches are short-lived: a few days at most. An old branch drifts away from `trunk`
   and is then costly to integrate.
4. One branch = one topic. If an unrelated fix comes up, it goes on another branch.
5. After the merge, the branch is deleted.

### Branch name

```
<type>/<issue-number>-<short-description>
```

| Type | What for |
|---|---|
| `feature/` | New functionality |
| `fix/` | Fixing a bug |
| `chore/` | Maintenance: dependencies, configuration, cleanup |
| `refactor/` | Code changes that do not alter behaviour |
| `docs/` | Documentation only |
| `test/` | Tests only |

The description is lowercase, in English, separated by hyphens and at most 5 words:
`feature/12-stages-layer`, not `feature/New_Layer-STAGES-on-the-map-with-icons`.

---

## Commits — Conventional Commits

```
<type>(<scope>): #<issue> <description>

- <why it is done>
- <another bullet if needed>
```

The issue number always goes right after the colon. The body carries **at least one
bullet** explaining the why.

### Types

| Type | What for |
|---|---|
| `feat` | New functionality |
| `fix` | Fixing a bug |
| `docs` | Documentation only |
| `style` | Formatting, no logic change |
| `refactor` | Neither fixes a bug nor adds functionality |
| `test` | Adding or fixing tests |
| `chore` | Build, dependencies, tooling |
| `perf` | Performance improvement |

### Scope

The affected area. The web scopes are the Spanish names of the areas of `src/` and stay
that way until the web is renamed.

| Scope | What it covers |
|---|---|
| `senda` | The course and the 1D projection (`src/lib/senda.ts`, `src/data/senda-carnaval.ts`) |
| `eta` | The ETA calculation and its states (`src/lib/eta.ts`, `BarraEta`) |
| `mapa` | MapLibre, layers, markers (`MapaDesfile`, `PantallaMapa`) |
| `densidad` | The crowd map |
| `comercios` | The businesses layer and its cards |
| `datos` | The data adapters (`src/lib/datos/`) |
| `api` | The routes in `src/app/api/` |
| `simulacion` | The simulation engine and the `simular` script |
| `reportero` | The reporters' panel (`/reportero`, `useReporte`) |
| `admin` | The admin panel (`/admin`, `src/app/api/admin/`) |
| `programacion` | Parades and events: the current parade, "Hoy", "Desfiles" |
| `fotos` | The photo wall and its moderation |
| `avisos` | Proximity push notifications and team messages to everyone |
| `i18n` | Texts in Spanish and English |
| `seguridad` | Sessions, rate limits, headers, input validation |
| `ui` | Screens and components that do not fit another scope |
| `pwa` | Service worker, manifest, icons |
| `deps` | Dependencies |
| `ci` | Continuous integration |
| `repo` | Repository configuration, contribution docs, agent tooling |
| `back` | The backend in `backend/` (FastAPI), its Nix environment, pre-commit, `just` and secrets with sops |
| `infra` | Terraform and deployment (`infra/`) |

If a new area appears (for example `mobile`), add it to this table in the same PR that
introduces it.

### Writing rules

- The description is in **English**, imperative and lowercase: "add", "fix", "remove". No
  final full stop and at most ~70 characters.
- **One PR = one commit = one logical change.** If the change does not fit in a reasonable
  commit, the issue is badly split: it is divided into several issues, not several commits.
- The body explains the **why** in bullets, not the what (the what is already in the diff).

```
feat(eta): #14 show the ETA in asymmetric 5-minute ranges

- A parade falls behind far more easily than it gets ahead: the range
  goes from −25 % to +40 %.
```

```
fix(eta): #21 discard speeds above 6 km/h

- A GPS jump made the head look like it was moving at 40 km/h and the
  ETA showed "llega en 1 min".
- Above the ceiling the measurement is discarded and the last valid
  speed is used.
```

---

## Pull Requests

**Every change to `trunk` comes in through a Pull Request**, without exception.

### Before opening the PR

- [ ] The branch is up to date with `trunk` (`git fetch origin && git rebase origin/trunk`)
- [ ] The project's checks pass locally. Web: `npm run typecheck` and `npm test` (and
      `npm run lint` once it exists). Backend: `just check` and `just test`, plus
      `just db-test` if a migration changed (see `docs/backend/PLAN.md`)
- [ ] You tried the change by hand (for the UI: you opened the app and saw it work)
- [ ] No secrets in the diff: no `.env`, no keys, no tokens
- [ ] No debug `console.log` or commented-out code left behind

### PR requirements

1. **Title**: the same as the commit, for example `feat(mapa): #12 add the stages layer`.
2. **Description**: in English, using the template (`.github/pull_request_template.md`).
   What changed and why, how it was tested and screenshots if it touches the UI. Include
   `Closes #<issue>` so the issue closes with the merge.
3. **Approval**: the maintainer is the one who approves and merges. An agent never merges
   its own PR.
4. Every review conversation is resolved before the merge.

### Merge strategy

**Squash and merge** to `trunk`: one commit per PR, with the PR title as the message.
Afterwards the branch is deleted.

---

## Keeping the branch up to date

If `trunk` moved on while you were working:

```bash
git fetch origin
git rebase origin/trunk
# resolve conflicts if there are any, then:
git push --force-with-lease
```

`--force-with-lease` only on **your own** working branch, never on `trunk`.

---

## AI attribution

**Never add AI marks** in commits, PRs, branches or code: no `Co-Authored-By: Claude …`
trailers, no "🤖 Generated with Claude Code", no links to the tool. The history reads like
any developer's. This repo rule takes priority over whatever the agent's session
instructions say by default.

In Claude Code, `.claude/settings.json` already disables automatic attribution
(`"attribution": { "commit": "", "pr": "" }`).

---

## Quick reference

```bash
# Start
git switch trunk
git pull origin trunk
git switch -c feature/12-stages-layer

# Work and commit (add files by name, not everything blindly)
git add src/components/MapaDesfile.tsx src/data/tarimas.json
git commit -m "feat(mapa): #12 add the stages layer" -m "- Stages are where most people stop to watch the parade."

# Push and open the PR
git push -u origin feature/12-stages-layer
gh pr create --base trunk --fill

# After the merge
git switch trunk
git pull origin trunk
git branch -d feature/12-stages-layer
```
