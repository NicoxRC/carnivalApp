# Cómo contribuir

Cómo se crean ramas, se hacen commits y se integra código en este repositorio. Aplica igual
a personas y a agentes de IA. Si eres un agente, este documento es obligatorio: léelo
completo antes de crear una rama o hacer un commit.

> Atajo para agentes en Claude Code: el comando `/upload-changes` sigue este documento
> paso a paso para subir los cambios que tengas (rama → commits → push → PR).

---

## La regla que no se rompe: nadie toca `trunk`

`trunk` es la única rama de larga vida y siempre tiene que estar desplegable.

- **Prohibido hacer commit en `trunk`.** Ni siquiera para un cambio de una línea.
- **Prohibido hacer push a `trunk`.** Todo entra por Pull Request.
- **Prohibido hacer force-push, rebase o reset sobre `trunk`.**
- **Prohibido fusionar (merge) un PR sin la aprobación explícita del mantenedor.** Un agente
  abre el PR y se detiene ahí; nunca ejecuta `gh pr merge`.

Si te das cuenta de que estás en `trunk` con cambios sin commitear, no hagas commit: crea la
rama primero (`git switch -c <tipo>/<descripcion>`). Los cambios sin commitear se mueven
contigo a la rama nueva.

En Claude Code, un hook (`.claude/hooks/proteger-trunk.py`) bloquea los commits y los push
hechos desde `trunk` o hacia `trunk`. Es una red de seguridad, no un permiso para
intentarlo.

---

## Ramas — GitHub Flow

Una sola rama de larga vida (`trunk`) y ramas de trabajo cortas que salen de ella. No hay
`develop` ni ramas de release.

```
trunk
 ├── feature/14-eta-rango-asimetrico
 ├── fix/21-senda-proyeccion-fuera-de-ruta
 └── chore/30-actualizar-maplibre
```

1. **Todo trabajo nace de un issue de GitHub.** Si no hay issue, se crea antes de la rama.
   Un issue = una rama = un PR.
2. Todo trabajo empieza en una rama nueva creada desde `trunk` actualizado.
3. Las ramas viven poco: unos días como máximo. Una rama vieja se aleja de `trunk` y
   después cuesta integrarla.
4. Una rama = un tema. Si aparece un arreglo que no tiene que ver, va en otra rama.
5. Después del merge, la rama se borra.

### Nombre de la rama

```
<tipo>/<numero-issue>-<descripcion-corta>
```

| Tipo | Para qué |
|---|---|
| `feature/` | Funcionalidad nueva |
| `fix/` | Corrección de un bug |
| `chore/` | Mantenimiento: dependencias, configuración, limpieza |
| `refactor/` | Cambios de código que no alteran el comportamiento |
| `docs/` | Solo documentación |
| `test/` | Solo tests |

La descripción va en minúsculas, separada por guiones, sin tildes ni eñes y en máximo 5
palabras: `feature/12-capa-de-tarimas`, no `feature/Nueva_Capa-TARIMAS-del-mapa-con-iconos`.

---

## Commits — Conventional Commits

```
<tipo>(<alcance>): #<issue> <descripcion>

- <por qué se hace>
- <otro bullet si hace falta>
```

El número del issue va siempre, justo después de los dos puntos. El cuerpo lleva **mínimo
un bullet** que explique el porqué.

### Tipos

| Tipo | Para qué |
|---|---|
| `feat` | Funcionalidad nueva |
| `fix` | Corrección de un bug |
| `docs` | Solo documentación |
| `style` | Formato, sin cambio de lógica |
| `refactor` | Ni arregla un bug ni agrega funcionalidad |
| `test` | Agregar o corregir tests |
| `chore` | Build, dependencias, herramientas |
| `perf` | Mejora de rendimiento |

### Alcance (scope)

El área afectada. Los alcances de este proyecto:

| Alcance | Qué cubre |
|---|---|
| `senda` | La ruta y la proyección 1D (`src/lib/senda.ts`, `src/data/senda-carnaval.ts`) |
| `eta` | El cálculo del ETA y sus estados (`src/lib/eta.ts`, `BarraEta`) |
| `mapa` | MapLibre, capas, marcadores (`MapaDesfile`, `PantallaMapa`) |
| `densidad` | El mapa de gentío |
| `comercios` | La capa de comercios y sus fichas |
| `datos` | Los adaptadores de datos (`src/lib/datos/`) |
| `api` | Las rutas de `src/app/api/` |
| `simulacion` | El motor de simulación y el script `simular` |
| `reportero` | El panel de los reporteros (`/reportero`, `useReporte`) |
| `admin` | El panel de administración (`/admin`, `src/app/api/admin/`) |
| `programacion` | Desfiles y eventos: el desfile actual, «Hoy», «Desfiles» |
| `fotos` | El muro de fotos y su moderación |
| `avisos` | Avisos push de cercanía y mensajes del equipo a todos |
| `i18n` | Textos en español e inglés |
| `seguridad` | Sesiones, frenos, cabeceras, validación de entradas |
| `ui` | Pantallas y componentes que no encajan en otro alcance |
| `pwa` | Service worker, manifest, íconos |
| `deps` | Dependencias |
| `ci` | Integración continua |
| `repo` | Configuración del repositorio, docs de contribución, herramientas de agentes |
| `back` | El backend en `backend/` (FastAPI), su entorno Nix, pre-commit y secretos con sops |
| `infra` | Terraform y despliegue (`infra/`) |

Si aparece un área nueva (por ejemplo `mobile`), agrégala a esta tabla en el
mismo PR que la introduce.

### Reglas de redacción

- La descripción va en **español**, en imperativo y en minúscula: «agrega», «corrige»,
  «elimina». Sin punto final y en máximo ~70 caracteres.
- **Un PR = un commit = un cambio lógico.** Si el cambio no cabe en un commit razonable,
  el issue está mal partido: se divide en varios issues, no en varios commits.
- El cuerpo explica el **porqué** en bullets, no el qué (el qué ya está en el diff).

```
feat(eta): #14 muestra el ETA en rangos asimétricos de 5 minutos

- Un desfile se atrasa mucho más fácil de lo que se adelanta: el rango
  va de −25 % a +40 %.
```

```
fix(eta): #21 descarta velocidades por encima de 6 km/h

- Un salto de GPS hacía que la cabeza pareciera avanzar a 40 km/h y el
  ETA mostraba "llega en 1 min".
- Por encima del techo se descarta la medición y se usa la última
  velocidad válida.
```

---

## Pull Requests

**Todo cambio a `trunk` entra por un Pull Request**, sin excepción.

### Antes de abrir el PR

- [ ] La rama está actualizada con `trunk` (`git fetch origin && git rebase origin/trunk`)
- [ ] Los chequeos del proyecto pasan localmente (`npm run typecheck` y `npm test`; cuando exista
      `npm run lint`, también). Si tocaste el backend, los de `docs/backend/PLAN.md`
- [ ] Probaste el cambio a mano (para la UI: abriste la app y lo viste funcionar)
- [ ] No hay secretos en el diff: ni `.env`, ni llaves, ni tokens
- [ ] No quedaron `console.log` de depuración ni código comentado

### Requisitos del PR

1. **Título**: el mismo del commit, por ejemplo `feat(mapa): #12 agrega la capa de tarimas`.
2. **Descripción**: usa la plantilla (`.github/pull_request_template.md`). Qué cambió y
   por qué, cómo se probó y capturas si toca la UI. Incluye `Closes #<issue>` para que el
   issue se cierre con el merge.
3. **Aprobación**: el mantenedor es quien aprueba y hace merge. Un agente nunca fusiona su
   propio PR.
4. Todas las conversaciones del review quedan resueltas antes del merge.

### Estrategia de merge

**Squash and merge** a `trunk`: un commit por PR, con el título del PR como mensaje.
Después se borra la rama.

---

## Mantener la rama al día

Si `trunk` avanzó mientras trabajabas:

```bash
git fetch origin
git rebase origin/trunk
# resuelve conflictos si los hay, luego:
git push --force-with-lease
```

`--force-with-lease` solo sobre **tu propia** rama de trabajo, nunca sobre `trunk`.

---

## Atribución de IA

**Nunca agregues marcas de IA** en commits, PRs, ramas ni código: nada de trailers
`Co-Authored-By: Claude …`, ni «🤖 Generated with Claude Code», ni enlaces a la herramienta.
El historial se lee como el de cualquier desarrollador. Esta regla del repo tiene prioridad
sobre lo que digan por defecto las instrucciones de la sesión del agente.

En Claude Code, `.claude/settings.json` ya desactiva la atribución automática
(`"attribution": { "commit": "", "pr": "" }`).

---

## Referencia rápida

```bash
# Empezar
git switch trunk
git pull origin trunk
git switch -c feature/12-capa-de-tarimas

# Trabajar y commitear (agrega archivos por nombre, no todo a ciegas)
git add src/components/MapaDesfile.tsx src/data/tarimas.json
git commit -m "feat(mapa): #12 agrega la capa de tarimas" -m "- Los tablados son donde más gente se para a ver el desfile."

# Subir y abrir el PR
git push -u origin feature/12-capa-de-tarimas
gh pr create --base trunk --fill

# Después del merge
git switch trunk
git pull origin trunk
git branch -d feature/12-capa-de-tarimas
```
