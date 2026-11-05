#!/usr/bin/env python3
"""Hook PreToolUse de Claude Code: bloquea commits y push que toquen `trunk`.

Bloquea:
  - `git commit` cuando la rama actual es trunk
  - `git push` cuando la rama actual es trunk y no se nombra otra rama,
    o cuando alguno de los refs del push apunta a trunk
  - `gh pr merge` (el merge lo hace el mantenedor)

Analiza el comando como lo haría el shell (comillas incluidas), así que un
mensaje de commit que mencione "push" o "trunk" no dispara el bloqueo.

Es una red de seguridad para agentes. La regla vive en docs/CONTRIBUTING.md.
"""

from __future__ import annotations

import json
import shlex
import subprocess
import sys

RAMA_PROTEGIDA = "trunk"
OPERADORES = {"&&", "||", ";", "|", "&", "(", ")", ";;"}
# Opciones globales de git que consumen el siguiente argumento.
OPCIONES_GIT_CON_VALOR = {"-C", "-c", "--git-dir", "--work-tree", "--namespace"}


def bloquear(motivo: str) -> None:
    print(
        f"Bloqueado: {motivo}\n"
        "Regla del repo (docs/CONTRIBUTING.md): nadie hace commit ni push a trunk y "
        "nadie fusiona PRs sin el mantenedor. Crea una rama con "
        "`git switch -c <tipo>/<descripcion>` y abre un PR, o usa /upload-changes.",
        file=sys.stderr,
    )
    sys.exit(2)


def rama_actual(cwd: str | None) -> str:
    try:
        salida = subprocess.run(
            ["git", "branch", "--show-current"],
            capture_output=True,
            text=True,
            cwd=cwd,
            timeout=5,
        )
        return salida.stdout.strip()
    except Exception:
        return ""


def segmentos(comando: str) -> list[list[str]]:
    """Divide el comando en comandos simples, respetando comillas."""
    lexer = shlex.shlex(comando, posix=True, punctuation_chars=True)
    lexer.whitespace_split = True
    resultado: list[list[str]] = [[]]
    for token in lexer:
        if token in OPERADORES:
            resultado.append([])
        else:
            resultado[-1].append(token)
    return [s for s in resultado if s]


def quitar_prefijos(tokens: list[str]) -> list[str]:
    """Quita asignaciones de entorno (FOO=bar) y envoltorios como `env` o `sudo`."""
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


def subcomando_git(tokens: list[str]) -> tuple[str, list[str]]:
    """Devuelve (subcomando, argumentos) de una invocación de git."""
    i = 1
    while i < len(tokens):
        t = tokens[i]
        if t in OPCIONES_GIT_CON_VALOR:
            i += 2
        elif t.startswith("-"):
            i += 1
        else:
            return t, tokens[i + 1 :]
    return "", []


def apunta_a_trunk(ref: str) -> bool:
    destino = ref.split(":", 1)[1] if ":" in ref else ref
    destino = destino.lstrip("+")
    return destino in {RAMA_PROTEGIDA, f"refs/heads/{RAMA_PROTEGIDA}"}


def revisar_push(args: list[str], rama: str) -> None:
    posicionales = [a for a in args if not a.startswith("-")]
    refs = posicionales[1:]  # el primero es el remoto
    if any(apunta_a_trunk(r) for r in refs):
        bloquear("no se puede hacer push hacia trunk.")
    sin_rama_explicita = not refs or all(r in {"HEAD", "@"} for r in refs)
    if rama == RAMA_PROTEGIDA and sin_rama_explicita:
        bloquear("estás en trunk y no se puede hacer push desde aquí.")


def main() -> None:
    try:
        datos = json.load(sys.stdin)
    except Exception:
        return

    comando = (datos.get("tool_input") or {}).get("command") or ""
    if not comando:
        return

    try:
        partes = segmentos(comando)
    except ValueError:
        # Comillas sin cerrar: el shell tampoco lo ejecutaría bien.
        return

    rama = rama_actual(datos.get("cwd"))

    for tokens in partes:
        tokens = quitar_prefijos(tokens)
        if not tokens:
            continue
        programa = tokens[0].rsplit("/", 1)[-1]

        if programa == "gh" and tokens[1:3] == ["pr", "merge"]:
            bloquear("fusionar PRs está reservado al mantenedor.")

        if programa != "git":
            continue

        sub, args = subcomando_git(tokens)
        if sub == "commit" and rama == RAMA_PROTEGIDA:
            bloquear("estás en trunk y no se puede hacer commit aquí.")
        if sub == "push":
            revisar_push(args, rama)


if __name__ == "__main__":
    main()
