#!/usr/bin/env python3
"""Claude Code PreToolUse hook: the agent never gets to see decrypted secrets.

Blocks, in Bash commands:
  - `sops` in any mode other than encrypting (`-d`, `decrypt`, `exec-env`,
    `exec-file`, opening a file to edit, `updatekeys`, `rotate`…)
  - `just secrets`, which opens the decrypted file in an editor
  - `age --decrypt` and `age-keygen -y`
  - anything that touches the private key file (`…/sops/age/keys.txt`),
    other than checking that it exists
And, in the Read tool, reading that key file.

Allowed on purpose: `just dev` and `just migrate`. They decrypt in memory and
hand the values to the server process without printing them.

The command is parsed the way the shell would (quotes included) and commands
nested in `bash -c '…'` or `nix develop -c …` are followed, so a commit
message or a document that merely mentions `sops -d` is not blocked.

It is a safety net for agents, not a security boundary: the real protection
is that the private key never leaves the maintainer's machine.
"""

from __future__ import annotations

import json
import re
import shlex
import sys

OPERATORS = {"&&", "||", ";", "|", "&", "(", ")", ";;", "|&"}
SHELLS = {"bash", "sh", "zsh", "dash"}
# Wrappers that run the rest of the line as a command.
PLAIN_WRAPPERS = {"env", "sudo", "command", "exec", "nohup", "time", "xargs"}
KEY_FILE = re.compile(r"sops/age/keys\.txt")
# Programs that may name the key file: they only tell whether it exists.
MAY_NAME_KEY_FILE = {"test", "[", "[[", "ls", "stat", "mkdir"}
HEREDOC = re.compile(r"<<-?\s*(['\"]?)([A-Za-z_][A-Za-z0-9_]*)\1")

SOPS_ENCRYPT = {"-e", "--encrypt", "encrypt"}
SOPS_HARMLESS = {"-v", "--version", "-h", "--help", "help", "filestatus"}
SOPS_DECRYPTING = {
    "-d",
    "--decrypt",
    "decrypt",
    "exec-env",
    "exec-file",
    "edit",
    "updatekeys",
    "rotate",
    "-r",
    "--rotate",
    "set",
    "unset",
    "groups",
    "keyservice",
    "publish",
}


def block(reason: str) -> None:
    print(
        f"Blocked: {reason}\n"
        "Repo rule: the agent never decrypts or displays secrets. To run the "
        "server or the migrations with the development secrets use `just dev` "
        "or `just migrate`. Anything that needs the values in the clear is for "
        "the maintainer.",
        file=sys.stderr,
    )
    sys.exit(2)


def without_heredocs(command: str) -> str:
    """Drops heredoc bodies: they are data (a file being written), not commands."""
    lines = command.split("\n")
    kept: list[str] = []
    terminator: str | None = None
    for line in lines:
        if terminator is not None:
            if line.strip() == terminator:
                terminator = None
            continue
        kept.append(line)
        found = HEREDOC.search(line)
        if found:
            terminator = found.group(2)
    return "\n".join(kept)


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


def unwrap(tokens: list[str]) -> list[str]:
    """Strips env assignments and wrappers until the real program is first."""
    while tokens:
        first = tokens[0]
        name = first.rsplit("/", 1)[-1]
        if "=" in first and not first.startswith("-") and first.split("=", 1)[0].isidentifier():
            tokens = tokens[1:]
        elif name in PLAIN_WRAPPERS:
            tokens = tokens[1:]
            # Skip the wrapper's own flags (`env -u VAR`, `sudo -E`…).
            while tokens and tokens[0].startswith("-"):
                tokens = tokens[1:]
        elif name == "nix" and any(t in {"-c", "--command"} for t in tokens):
            cut = next(i for i, t in enumerate(tokens) if t in {"-c", "--command"})
            tokens = tokens[cut + 1 :]
        elif name == "direnv" and tokens[1:2] == ["exec"]:
            tokens = tokens[3:]
        else:
            break
    return tokens


def shell_script(tokens: list[str]) -> str | None:
    """The script of `bash -c '<script>'` (also `-lc`, `-euo pipefail -c`…)."""
    for i, token in enumerate(tokens[1:], start=1):
        if token.startswith("-") and not token.startswith("--") and "c" in token[1:]:
            return tokens[i + 1] if i + 1 < len(tokens) else None
    return None


def check_sops(args: list[str]) -> None:
    words = set(args)
    if words & SOPS_DECRYPTING:
        block("`sops` in a mode that decrypts.")
    if words & SOPS_ENCRYPT or words & SOPS_HARMLESS:
        return
    # `sops <file>` with no mode opens the decrypted file in an editor.
    block("`sops` is only allowed for encrypting (`--encrypt`).")


def check(command: str, depth: int = 0) -> None:
    if depth > 5:
        return
    try:
        parts = segments(without_heredocs(command))
    except ValueError:
        # Unbalanced quotes: the shell would not run it properly either.
        return

    for raw in parts:
        tokens = unwrap(raw)
        if not tokens:
            continue
        program = tokens[0].rsplit("/", 1)[-1]
        args = tokens[1:]

        if program in SHELLS:
            script = shell_script(tokens)
            if script:
                check(script, depth + 1)
            continue

        if any(KEY_FILE.search(t) for t in tokens) and program not in MAY_NAME_KEY_FILE:
            block("that command touches the age private key file.")

        if program == "sops":
            check_sops(args)
        elif program == "just" and "secrets" in args:
            block("`just secrets` opens the decrypted secrets in an editor.")
        elif program == "age" and {"-d", "--decrypt"} & set(args):
            block("`age --decrypt`.")
        elif program == "age-keygen" and "-y" in args:
            block("`age-keygen -y` reads the private key.")


def main() -> None:
    try:
        data = json.load(sys.stdin)
    except Exception:
        return

    tool_input = data.get("tool_input") or {}

    if data.get("tool_name") == "Read":
        if KEY_FILE.search(tool_input.get("file_path") or ""):
            block("reading the age private key file.")
        return

    command = tool_input.get("command") or ""
    if command:
        check(command)


if __name__ == "__main__":
    main()
