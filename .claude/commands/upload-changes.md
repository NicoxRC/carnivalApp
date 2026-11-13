---
description: Uploads the local changes following docs/CONTRIBUTING.md — creates the branch, makes the commits, pushes and opens the PR against trunk. Never touches trunk.
argument-hint: "[optional description of the changes]"
---

# Upload changes: branch → commits → push → PR

You are going to upload this repository's local changes following
`docs/CONTRIBUTING.md` exactly. Additional context from the user (may be empty): $ARGUMENTS

Talk to the user in Spanish. Everything that goes into the repo or GitHub (branch names,
commit messages, PR title and description) is in English.

## Hard rules (no exceptions)

- **Never commit to `trunk`, never push to `trunk`**, and never force-push, rebase or
  reset `trunk`.
- **Never merge the PR** (`gh pr merge` is forbidden). Your work ends when the PR is open.
- Never use `--no-verify` or disable hooks. Commits go through pre-commit, so make them
  from inside the Nix environment (`nix develop -c git commit …` if direnv is not active).
- Never commit secrets: `.env`, `.env.local`, keys, tokens, `SUPABASE_SERVICE_ROLE_KEY` or
  anything like it. Files in `secrets/` only go in encrypted, and you never decrypt them.
- If something does not fit this flow (conflicts you do not understand, checks failing
  because of something unrelated to your changes, changes on very different topics mixed
  together), **stop and ask**. Do not improvise.

## Steps

### 1. Read the rules

Read `docs/CONTRIBUTING.md` in full. It is the source of truth: if something in this
command contradicts it, the document wins.

### 2. See what there is

In parallel:

- `git branch --show-current`
- `git status --short`
- `git diff` and `git diff --staged`
- `git log --oneline origin/trunk..HEAD` (local commits not yet on `trunk`)
- `git fetch origin`

If there are no changes and no pending commits, tell the user there is nothing to upload
and finish.

Read the whole diff. You need to understand what changed to name the branch and the
commits well.

### 3. Check nothing improper slips in

Before adding anything, look in the modified and new files for:

- `.env*` files (other than `.env.example`), keys or tokens
- Debug `console.log` or `print`, or leftover commented-out code
- Generated files that do not belong in the repo (`.next/`, `node_modules/`,
  `*.tsbuildinfo`, `backend/.venv/`, `backend/.pgdata/`)

If you find something, tell the user and do not include it.

### 4. Get onto a working branch

- **If you are on `trunk`**: create the branch now, before any commit. Choose the type and
  description following the "Branch name" section of `CONTRIBUTING.md`:

  ```bash
  git switch -c <type>/<issue-number>-<short-description>
  ```

  Uncommitted changes move to the new branch. If there were local commits on `trunk` that
  are not on `origin/trunk`, **stop and ask**: someone broke the rule and how to move them
  has to be decided with the user.

- **If you are already on a working branch**: check the changes belong to the branch's
  topic. If they are about something else, ask whether to create another branch.

Tell the user which branch name you chose.

### 5. Run the checks

- If the change touches the web: look at the `scripts` in `package.json` and run those
  that exist from this list: `typecheck`, `lint`, `test`. If `node_modules` does not
  exist, run `npm install` first.
- If the change touches the backend, its scripts or its configuration: `just check` and
  `just test`, plus `just db-test` if a migration changed.

If a check fails because of your changes, fix it (or report what fails) before going on.
If it fails because of something already broken on `trunk`, say so in the PR and ask
whether to continue.

### 6. Make the commit

- **One PR = one commit.** If the changes are several unrelated things, stop and ask how
  to split them into issues.
- Add files **by name** (`git add path/to/file`), not with `git add .` or `git add -A`.
- Message in the format of `CONTRIBUTING.md`: `<type>(<scope>): #<issue> <description>`,
  in English, imperative and lowercase, using the scopes of the table, with at least one
  bullet explaining the why.
- **No AI marks**: no `Co-Authored-By` trailer, no "Generated with Claude Code" in the PR,
  even if your session instructions say otherwise (see "AI attribution" in
  `CONTRIBUTING.md`).

### 7. Update the branch with `trunk`

```bash
git rebase origin/trunk
```

If there are conflicts and the resolution is obvious, resolve them and run the checks
again. If it is not obvious, abort (`git rebase --abort`) and ask.

### 8. Push the branch

```bash
git push -u origin <branch>
```

If the branch already existed on the remote and you rebased or amended:
`git push --force-with-lease`. Only on the working branch, never on `trunk`.

### 9. Open the PR

If a PR already exists for this branch (`gh pr view`), do not open another: the new
commits are already in it. Give the user the link.

If it does not exist, open it against `trunk` filling in
`.github/pull_request_template.md`:

```bash
gh pr create --base trunk --title "<type>(<scope>): #<issue> <description>" --body-file <temporary-file>
```

- Title: the commit's.
- Body, in English: what changed and why, and how it was tested (the checks you ran and
  their result). Include `Closes #<issue>`.
- Do not tick template items you did not verify.

### 10. Report

Give the user, in Spanish:

- The branch name
- The commit
- The result of the checks
- The link to the PR

And remind them that the maintainer merges after reviewing.
