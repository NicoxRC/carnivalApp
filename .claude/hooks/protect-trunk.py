#!/usr/bin/env python3
"""Claude Code PreToolUse hook: blocks commits and pushes that touch `trunk`.

Blocks:
  - `git commit` when the current branch is trunk
  - `git push` when the current branch is trunk and no other branch is named,
    or when any of the push refs points to trunk
  - `gh pr merge` (the maintainer merges)

It parses the command the way the shell would (quotes included), so a commit
message that mentions "push" or "trunk" does not trigger the block.

It is a safety net for agents. The rule lives in docs/CONTRIBUTING.md.
"""

from __future__ import annotations

import json
import shlex
import subprocess
import sys

PROTECTED_BRANCH = "trunk"
OPERATORS = {"&&", "||", ";", "|", "&", "(", ")", ";;"}
# Global git options that consume the next argument.
GIT_OPTIONS_WITH_VALUE = {"-C", "-c", "--git-dir", "--work-tree", "--namespace"}


def block(reason: str) -> None:
    print(
        f"Blocked: {reason}\n"
        "Repo rule (docs/CONTRIBUTING.md): nobody commits or pushes to trunk and "
        "nobody merges PRs but the maintainer. Create a branch with "
        "`git switch -c <type>/<description>` and open a PR, or use /upload-changes.",
        file=sys.stderr,
    )
    sys.exit(2)


def current_branch(cwd: str | None) -> str:
    try:
        output = subprocess.run(
            ["git", "branch", "--show-current"],
            capture_output=True,
            text=True,
            cwd=cwd,
            timeout=5,
        )
        return output.stdout.strip()
    except Exception:
        return ""


def segments(command: str) -> list[list[str]]:
    """Splits the command into simple commands, respecting quotes."""
    lexer = shlex.shlex(command, posix=True, punctuation_chars=True)
    lexer.whitespace_split = True
    result: list[list[str]] = [[]]
    for token in lexer:
        if token in OPERATORS:
            result.append([])
        else:
            result[-1].append(token)
    return [s for s in result if s]


def strip_prefixes(tokens: list[str]) -> list[str]:
    """Removes env assignments (FOO=bar) and wrappers such as `env` or `sudo`."""
    i = 0
    while i < len(tokens):
        t = tokens[i]
        if "=" in t and not t.startswith("-") and t.split("=", 1)[0].isidentifier():
            i += 1
        elif t in {"env", "sudo", "command", "exec", "nohup", "time"}:
            i += 1
        else:
            break
    return tokens[i:]


def git_subcommand(tokens: list[str]) -> tuple[str, list[str]]:
    """Returns (subcommand, arguments) of a git invocation."""
    i = 1
    while i < len(tokens):
        t = tokens[i]
        if t in GIT_OPTIONS_WITH_VALUE:
            i += 2
        elif t.startswith("-"):
            i += 1
        else:
            return t, tokens[i + 1 :]
    return "", []


def points_to_trunk(ref: str) -> bool:
    target = ref.split(":", 1)[1] if ":" in ref else ref
    target = target.lstrip("+")
    return target in {PROTECTED_BRANCH, f"refs/heads/{PROTECTED_BRANCH}"}


def check_push(args: list[str], branch: str) -> None:
    positional = [a for a in args if not a.startswith("-")]
    refs = positional[1:]  # the first one is the remote
    if any(points_to_trunk(r) for r in refs):
        block("pushing to trunk is not allowed.")
    no_explicit_branch = not refs or all(r in {"HEAD", "@"} for r in refs)
    if branch == PROTECTED_BRANCH and no_explicit_branch:
        block("you are on trunk and cannot push from here.")


def main() -> None:
    try:
        data = json.load(sys.stdin)
    except Exception:
        return

    command = (data.get("tool_input") or {}).get("command") or ""
    if not command:
        return

    try:
        parts = segments(command)
    except ValueError:
        # Unbalanced quotes: the shell would not run it properly either.
        return

    branch = current_branch(data.get("cwd"))

    for tokens in parts:
        tokens = strip_prefixes(tokens)
        if not tokens:
            continue
        program = tokens[0].rsplit("/", 1)[-1]

        if program == "gh" and tokens[1:3] == ["pr", "merge"]:
            block("merging PRs is reserved for the maintainer.")

        if program != "git":
            continue

        sub, args = git_subcommand(tokens)
        if sub == "commit" and branch == PROTECTED_BRANCH:
            block("you are on trunk and cannot commit here.")
        if sub == "push":
            check_push(args, branch)


if __name__ == "__main__":
    main()
