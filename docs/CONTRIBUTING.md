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
- The web app (`apps/web/src/`) is still written in Spanish and keeps its names until it is renamed
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
   branch. One issue = one branch = one PR. An issue delivers something working end
   to end (in the backend, a whole module: tables, repository and endpoints), not one
   piece of it. Issues that belong to a larger effort are grouped in a **milestone**,
   whose description carries the plan and the order.
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

The affected area, in English like everything in the repo (only the texts people read inside the
app are in Spanish).

| Scope | What it covers |
|---|---|
| `course` | The course and the 1D projection (`apps/web/src/lib/course.ts`, `apps/web/src/data/carnival-course.ts`) |
| `eta` | The ETA calculation and its states (`apps/web/src/lib/eta.ts`, `EtaBar`) |
| `map` | MapLibre, layers, markers (`ParadeMap`, `MapScreen`) |
| `density` | The crowd map |
| `businesses` | The businesses layer and its cards |
| `data` | How the web reads and writes the backend's data |
| `simulation` | The simulation engine and the `simular` script |
| `reporter` | The reporters' panel (`/reporter`, `useReporting`) |
| `admin` | The admin panel (`/admin`) |
| `schedule` | Parades and events: the current parade, "Hoy", "Desfiles" |
| `photos` | The photo wall and its moderation |
| `notifications` | Proximity push notifications and team messages to everyone |
| `i18n` | Texts in Spanish and English |
| `security` | Sessions, rate limits, headers, input validation |
| `ui` | Screens and components that do not fit another scope |
| `pwa` | Service worker, manifest, icons |
| `deps` | Dependencies |
| `ci` | Continuous integration |
| `repo` | Repository configuration, contribution docs, agent tooling |
| `backend` | The backend in `apps/backend/` (FastAPI), its Nix environment, pre-commit, `just` and secrets with sops |
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
- [ ] The project's checks pass locally. Web (from `apps/web/`): `npm run typecheck` and `npm test` (and
      `npm run lint` once it exists). Backend: `just check` and `just test`, plus
      `just db-test` if a migration changed
- [ ] You tried the change by hand (for the UI: you opened the app and saw it work)
- [ ] No secrets in the diff: no `.env`, no keys, no tokens
- [ ] No debug `console.log` or commented-out code left behind

### PR requirements

1. **Title**: the same as the commit, for example `feat(map): #12 add the stages layer`.
2. **Description**: in English, using the template (`.github/pull_request_template.md`).
   What changed and why, how it was tested and screenshots if it touches the UI. Include
   `Closes #<issue>` so the issue closes with the merge.
3. **Approval**: the maintainer is the one who approves and merges. An agent never merges
   its own PR.
4. Every review conversation is resolved before the merge.

### Merge strategy

**Rebase and merge** to `trunk` (the only method enabled): the PR's single commit lands
on `trunk` as it is. Afterwards the branch is deleted.

If your branch was based on another PR's branch, after that PR merges GitHub rewrites its
commit with a new hash: rebase onto `trunk` dropping the old copy
(`git rebase --onto origin/trunk <old-commit>`) and push with `--force-with-lease`.

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

## Working an issue with an agent

The maintainer is learning several of the tools in this repo. So an agent works each issue
like this:

1. **Explain and wait.** Before creating the branch or touching a file, write in the chat,
   in Spanish:
   1. **What you are going to do**, in two or three sentences and without jargon.
   2. **How it works**: each new tool or concept of the issue explained as to someone who
      programs but has not used it (what it is, what it is for here, what would happen
      without it). The issue's **To understand** is the starting point.
   3. **Which files you will create or change**, one per line with a sentence on what for.
   4. **Which decisions you are making** that the issue does not fix, if any.
   5. **How it is tested**: which command to run and what should be seen.

   Then **stop and wait** for the maintainer's OK. Do not chain two issues without a new
   confirmation.
2. Create the branch, make the change, run the checks, make a single commit and open the
   PR. Its description includes **"How it works"** (the explanation of step 1 adjusted to
   what was built) and `Closes #<issue>`.
3. **Stop.** The maintainer merges.

Rules:

- Respect the issue's **Depends on**: do not start it until its dependencies are on
  `trunk`.
- Do only what **What** says. **Out of scope** is not touched even if it looks easy.
- **Needs the maintainer**: do the code part and leave the manual steps written in the PR.
  Never make up credentials or keys.
- Architecture decisions of the backend are in `docs/backend/ARCHITECTURE.md`; follow them
  or open the discussion in the PR, never change them silently.

### Tests

- **Backend:** unit tests with pytest, no real database and no network. For every public
  function or endpoint an issue adds, at least `test_<thing>_ok` (the good case) and
  `test_<thing>_fails` (invalid input, missing resource, no permission…). A third test
  only for a specific business rule or boundary the issue asks for. Endpoints are tested
  with `TestClient` and the in-memory fake repositories (`app.dependency_overrides`).
  Migrations are checked with `just db-test`, not unit-tested.
- **Web:** `node:test` + `tsx` (`src/**/*.test.ts`). Pure logic (`eta.ts`, `course.ts`,
  `dates.ts`, the API mapping) gets a test when it changes.

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
git add apps/web/src/components/ParadeMap.tsx apps/web/src/data/tarimas.json
git commit -m "feat(map): #12 add the stages layer" -m "- Stages are where most people stop to watch the parade."

# Push and open the PR
git push -u origin feature/12-stages-layer
gh pr create --base trunk --fill

# After the merge
git switch trunk
git pull origin trunk
git branch -d feature/12-stages-layer
```
