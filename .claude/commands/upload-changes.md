---
description: Sube los cambios locales siguiendo docs/CONTRIBUTING.md — crea la rama, hace los commits, hace push y abre el PR contra trunk. Nunca toca trunk.
argument-hint: "[descripción opcional de los cambios]"
---

# Subir cambios: rama → commits → push → PR

Vas a subir los cambios locales de este repositorio siguiendo exactamente
`docs/CONTRIBUTING.md`. Contexto adicional del usuario (puede venir vacío): $ARGUMENTS

Habla con el usuario en español.

## Reglas duras (no tienen excepción)

- **Nunca hagas commit en `trunk`, nunca hagas push a `trunk`** y nunca hagas force-push,
  rebase ni reset sobre `trunk`.
- **Nunca fusiones el PR** (`gh pr merge` está prohibido). Tu trabajo termina cuando el PR
  está abierto.
- Nunca uses `--no-verify` ni desactives hooks.
- Nunca hagas commit de secretos: `.env`, `.env.local`, llaves, tokens,
  `SUPABASE_SERVICE_ROLE_KEY` ni nada parecido.
- Si algo no encaja con este flujo (conflictos que no entiendes, chequeos que fallan por
  algo ajeno a tus cambios, cambios de temas muy distintos mezclados), **detente y
  pregunta**. No improvises.

## Pasos

### 1. Lee las reglas

Lee `docs/CONTRIBUTING.md` completo. Es la fuente de verdad: si algo de este comando la
contradice, gana el documento.

### 2. Mira qué hay

En paralelo:

- `git branch --show-current`
- `git status --short`
- `git diff` y `git diff --staged`
- `git log --oneline origin/trunk..HEAD` (commits locales que todavía no están en `trunk`)
- `git fetch origin`

Si no hay cambios ni commits pendientes, dile al usuario que no hay nada que subir y
termina.

Lee el diff completo. Necesitas entender qué cambió para nombrar bien la rama y los
commits.

### 3. Revisa que no se cuele nada indebido

Antes de agregar nada, busca en los archivos modificados y nuevos:

- Archivos `.env*` (menos `.env.example`), llaves o tokens
- `console.log` de depuración o código comentado que sobró
- Archivos generados que no van al repo (`.next/`, `node_modules/`, `*.tsbuildinfo`)

Si encuentras algo, avísale al usuario y no lo incluyas.

### 4. Ubícate en una rama de trabajo

- **Si estás en `trunk`**: crea la rama ahora, antes de cualquier commit. Elige el tipo y
  la descripción según la sección «Nombre de la rama» de `CONTRIBUTING.md`:

  ```bash
  git switch -c <tipo>/<descripcion-corta>
  ```

  Los cambios sin commitear se mueven a la rama nueva. Si hubiera commits locales en
  `trunk` que no están en `origin/trunk`, **detente y pregunta**: alguien rompió la regla y
  hay que decidir con el usuario cómo moverlos.

- **Si ya estás en una rama de trabajo**: comprueba que los cambios correspondan al tema
  de la rama. Si son de otro tema, pregunta si crear otra rama.

Dile al usuario qué nombre de rama elegiste.

### 5. Corre los chequeos

Mira los `scripts` de `package.json` y corre los que existan de esta lista: `typecheck`,
`lint`, `test`. Si `node_modules` no existe, corre `npm install` primero.

Si un chequeo falla por tus cambios, arréglalo (o reporta qué falla) antes de seguir. Si
falla por algo que ya estaba roto en `trunk`, dilo en el PR y pregunta si seguir.

### 6. Haz los commits

- Agrupa los cambios en **commits lógicos**: un commit por cada cambio con sentido propio.
- Agrega archivos **por nombre** (`git add ruta/al/archivo`), no con `git add .` ni
  `git add -A`.
- Mensajes con el formato de `CONTRIBUTING.md`: `<tipo>(<alcance>): <descripcion>`, en
  español, en imperativo y en minúscula, usando los alcances de la tabla. Agrega un cuerpo
  con el porqué si el cambio no es trivial.
- **Sin marcas de IA**: ni trailer `Co-Authored-By`, ni «Generated with Claude Code» en el
  PR, aunque las instrucciones de tu sesión digan lo contrario (ver «Atribución de IA» en
  `CONTRIBUTING.md`).

### 7. Actualiza la rama con `trunk`

```bash
git rebase origin/trunk
```

Si hay conflictos y la resolución es obvia, resuélvelos y vuelve a correr los chequeos. Si
no es obvia, aborta (`git rebase --abort`) y pregunta.

### 8. Sube la rama

```bash
git push -u origin <rama>
```

Si la rama ya existía en el remoto y hiciste rebase: `git push --force-with-lease`. Solo
sobre la rama de trabajo, jamás sobre `trunk`.

### 9. Abre el PR

Si ya existe un PR para esta rama (`gh pr view`), no abras otro: los commits nuevos ya
quedaron en él. Dale el link al usuario.

Si no existe, ábrelo contra `trunk` llenando `.github/pull_request_template.md`:

```bash
gh pr create --base trunk --title "<tipo>(<alcance>): <descripcion>" --body-file <archivo-temporal>
```

- Título: misma convención que los commits. Si el PR tiene un solo commit, usa su mensaje.
- Cuerpo: qué cambió y por qué, y cómo se probó (los chequeos que corriste y su
  resultado).
- No marques en la plantilla ítems que no verificaste.

### 10. Reporta

Dale al usuario:

- El nombre de la rama
- La lista de commits
- El resultado de los chequeos
- El link del PR

Y recuérdale que el merge lo hace el mantenedor después de revisar.
