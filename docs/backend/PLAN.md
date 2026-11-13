# Plan del backend

Plan para reemplazar el backend embebido en `src/app/api/` (y los adaptadores `local` y
`supabase` de `src/lib/datos/`) por un servicio propio. Está escrito para que un agente lo
ejecute **issue por issue**, explicando cada paso antes de hacerlo y sin tomar decisiones de
arquitectura por su cuenta.

Stack decidido: **FastAPI + PostgreSQL**, entorno con **Nix**, dependencias con **uv**,
secretos con **sops + age**, **pre-commit**, **tests unitarios con pytest**, **CI/CD en
GitHub Actions** y despliegue con **Terraform sobre Railway** (primera iteración).

Orden: base mínima → **usuarios y roles** → senda y desfiles → el desfile en vivo →
contenido y comunidad (avisos, eventos, comercios, fotos, push) → secretos y despliegue →
conectar la web. **Todo lo que hoy hace `src/app/api/` existe en el backend antes de
desplegar.**

---

## 0. Cómo trabajar este plan (léelo entero si eres un agente)

### Paso 1 de cada issue: explicar y esperar el OK

El mantenedor está aprendiendo varias de estas herramientas. **Antes de crear la rama o
tocar un archivo**, escribe en el chat:

1. **Qué vas a hacer**, en dos o tres frases y sin jerga.
2. **Cómo funciona**: cada herramienta o concepto nuevo de este issue explicado como a
   alguien que programa pero no lo ha usado (qué es, para qué sirve aquí, qué pasaría si
   no estuviera). Cada issue trae **Para entender** como punto de partida; amplíalo con lo
   que vayas a escribir de verdad.
3. **Qué archivos vas a crear o cambiar**, uno por línea con una frase de para qué.
4. **Qué decisiones tomas** que el plan no fija, si hay alguna.
5. **Cómo se prueba**: qué comando correr y qué se debería ver.

Después **detente y espera** a que el mantenedor responda que siga. Si pregunta algo,
respóndelo antes de empezar. No encadenes dos issues sin una nueva confirmación.

### Pasos siguientes

2. Crea la rama, haz el cambio, corre los chequeos (abajo).
3. Un solo commit y abre el PR. En la descripción del PR incluye **«Cómo funciona»** con la
   explicación del paso 1 ya ajustada a lo que quedó, y `Closes #<issue>`.
4. **Detente.** El merge lo hace el mantenedor (ver `docs/CONTRIBUTING.md`).

### Reglas

- Cada sección de §2 es **un issue de GitHub**; el encabezado trae su número real
  (`#13 · B11`). `B##` es el orden de ejecución; `#NN` es el issue.
- **Un issue = una rama = un PR = un commit.** Si no cabe en un commit razonable, el issue
  está mal partido: avisa, no lo agrandes.
- Respeta `Depende de`: no empieces un issue cuyas dependencias no estén en `trunk`.
- Haz solo lo que dice `Qué`. `Fuera de alcance` no se toca aunque parezca fácil.
- Si un issue dice **«Requiere al mantenedor»**, haz la parte de código y deja los pasos
  manuales escritos en el PR. Nunca inventes credenciales ni llaves.
- **Al portar algo de `src/`, el código TypeScript es la especificación.** Lee la ruta y
  los módulos que usa antes de escribir; si el plan y el código no coinciden en un detalle
  de comportamiento (un límite, un mensaje, un código HTTP), gana el código y lo dices en
  el PR. Las únicas diferencias deliberadas son las de §1.

### Rama

```
<tipo>/<numero-issue>-<descripcion-corta>
```

`feature/16-login-jwt`, `chore/4-flake-nix`, `docs/3-plan-backend`.

### Commit (y título del PR, que es el mismo)

```
<tipo>(<alcance>): #<issue> <titulo>

- <por qué se hace / qué decisión se tomó>
- <otro bullet si hace falta>
```

- Tipos: los de `docs/CONTRIBUTING.md` (`feat`, `fix`, `chore`, `docs`, `test`, `refactor`).
- Alcances nuevos: `back` (todo `backend/`, Nix, pre-commit, sops), `infra` (Terraform en
  `infra/`) y `ci` (GitHub Actions, ya existía). Lo que toca la web usa sus alcances de
  siempre (`datos`, `ui`, `simulacion`…).
- **Mínimo un bullet** explicando el porqué. El qué ya está en el diff.
- Sin marcas de IA (ni `Co-Authored-By`, ni «Generated with…»).

Ejemplo:

```
feat(back): #16 agrega el login con correo y contraseña

- Devuelve un JWT de 20 h: un reportero no puede volver a loguearse a mitad
  del desfile con la mano ocupada.
- Correo inexistente y contraseña mala responden igual (401) para no revelar
  qué correos están registrados.
```

### Skills

Antes de escribir código del backend lee completa la skill `fastapi`
(`.agents/skills/fastapi/`). Donde choque con este plan, gana este plan (ver §1.11).

### Antes de abrir el PR

```bash
nix develop -c pre-commit run --all-files
nix develop -c bash -c "cd backend && uv run pytest"
```

Los dos tienen que pasar. Desde B05 el CI corre lo mismo. Si el issue toca la web, además
`npm run typecheck` y `npm test`.

### Regla de tests

Tests **unitarios** con pytest. Sin base de datos real, sin red.

- Por cada función pública o endpoint que el issue agregue, como mínimo:
  - `test_<cosa>_ok`: el caso bueno.
  - `test_<cosa>_falla`: el caso malo (entrada inválida, recurso inexistente, sin permiso…).
- **Un tercer test solo si el issue lo pide** en `Tests`, y es siempre un caso muy
  específico (una regla de negocio, una frontera). No se agregan tests «por si acaso».
- Los endpoints se prueban con `TestClient` de FastAPI y los repositorios reemplazados por
  los falsos en memoria (`app.dependency_overrides`). Nunca contra Postgres, S3 ni un
  servicio de push real.
- Nombres de tests y de código en español, como el resto del proyecto.

---

## 1. Decisiones de arquitectura (ya tomadas)

Si algo no te convence, ábrelo como discusión en el PR. No lo cambies en silencio.

### 1.1 Monorepo

```
flake.nix                  entorno de desarrollo (raíz: lo usan back, infra y CI)
.pre-commit-config.yaml
.sops.yaml
secrets/                   *.enc.yaml cifrados con sops (nunca texto plano)
backend/
  pyproject.toml  uv.lock  alembic.ini  Dockerfile
  app/
    main.py                crea la app, monta routers, CORS, errores
    config.py              pydantic-settings
    db.py                  engine y sesión async
    errores.py             formato de error uniforme
    seguridad.py           contraseñas, JWT, dependencias de usuario y permiso
    permisos.py            roles, permisos y la tabla que los une
    frenos.py              límites por IP / dispositivo (en memoria)
    tiempo_real.py         LISTEN/NOTIFY → SSE
    almacenamiento.py      fotos: disco local o S3
    push.py                envío de avisos web push
    modelos.py             tablas (SQLAlchemy)
    dominio/               lógica pura, sin I/O
    esquemas/              modelos Pydantic del contrato HTTP
    repositorios/          protocolo + Postgres + falso en memoria, uno por recurso
    rutas/                 un archivo por recurso
    cli.py                 comandos de administración (crear admin, sembrar)
  migraciones/             Alembic
  seed/                    senda.json, datos de ejemplo y fixtures exportados desde la web
  tests/
infra/                     Terraform (Railway)
```

### 1.2 El contrato HTTP

La web consume `src/app/api/`. El backend expone **las mismas rutas con el mismo JSON**
(camelCase, mismos nombres que `src/lib/tipos.ts` y `src/lib/densidad.ts`), salvo la
autenticación (§1.3). Así conectar la web es cambiar la URL base y el login, no reescribir
pantallas.

| Ruta | Acceso | Issue |
|---|---|---|
| `GET /api/salud` | público | B03, B07 |
| `POST /api/auth/login`, `GET /api/auth/yo` | público / sesión | B14 |
| `GET/POST/PATCH/DELETE /api/admin/usuarios` | `usuarios:gestionar` | B17 |
| `GET /api/senda` | público | B21 |
| `GET /api/programacion` | público | B22, B36 |
| `GET/PUT/PATCH/DELETE /api/admin/desfiles` | `desfiles:*` | B23 |
| `POST /api/posiciones` | `posiciones:*` | B28 |
| `GET /api/estado` | público | B29 |
| `GET /api/estado/stream` | público | B30 |
| `GET /api/desfiles/{id}/recorrido` | público | B31 |
| `POST /api/dispositivo` | público, con freno por IP | B33 |
| `GET/POST /api/densidad` | público / dispositivo | B34 |
| `GET/POST/DELETE /api/admin/avisos` | `avisos:gestionar` | B35 |
| `GET/PUT/DELETE /api/admin/eventos` | `programacion:editar` | B36 |
| `GET /api/comercios`, `GET/PUT/DELETE /api/admin/comercios` | público / `comercios:editar` | B37 |
| `POST /api/comercios/evento`, métricas en admin | público / `metricas:ver` | B38 |
| `GET/POST /api/fotos`, `GET /api/fotos/{id}` | público / dispositivo | B40 |
| `GET/PATCH/DELETE /api/admin/fotos` | `fotos:moderar` | B41 |
| `GET/POST/DELETE /api/avisos-push` | público | B42 |
| ~~`/api/admin/sesion`, `/api/reportero/sesion`~~ | — | reemplazadas por `/api/auth` |
| ~~`/api/admin/reporteros`~~ | — | reemplazada por `/api/admin/usuarios` |
| ~~`POST /api/simulacion`~~ | — | **no se porta**: el simulador es `npm run simular` con un usuario `ingesta` |

- Errores: siempre `{"error": "<mensaje en español>"}` con el código HTTP correcto.
- Pydantic: `model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)`;
  las respuestas salen `by_alias=True`.
- **No existe «el» desfile: existe el desfile ACTUAL** (`src/lib/desfiles.ts`). El servidor
  lo resuelve; el cliente público no manda id. Un id que no existe da 404; jamás se crea un
  desfile por pedirlo.
- **«Hoy» y «ahora» son hora de Pasto** (`America/Bogota`), como en `src/lib/fecha.ts`.

### 1.3 Usuarios, roles y permisos

- **El público no tiene cuenta.** Ver el desfile, aportar al gentío, subir fotos y pedir
  avisos sigue siendo anónimo (con el id de dispositivo firmado donde hoy se usa).
- **El equipo sí:** login con **correo y contraseña**. Reemplaza la contraseña única de
  admin (`ADMIN_CLAVE`), los códigos de reportero y el `INGESTA_TOKEN`.
- **Roles → permisos.** Un usuario tiene uno o varios roles (tabla `usuario_roles`). Los
  endpoints nunca preguntan por un rol: preguntan por un **permiso**. La tabla que une
  roles y permisos vive en código (`app/permisos.py`), versionada y con tests.

| Rol | Para quién | Permisos |
|---|---|---|
| `admin` | dueños del sistema | todos |
| `coordinador` | quien dirige el día del desfile | `desfiles:estado`, `avisos:gestionar`, `usuarios:ver`, `posiciones:cualquiera` |
| `editor` | quien carga contenido | `desfiles:editar`, `programacion:editar`, `comercios:editar`, `metricas:ver` |
| `moderador` | quien revisa fotos | `fotos:moderar` |
| `reportero` | quien camina con el desfile | `posiciones:propias` |
| `ingesta` | cuentas de servicio (simulador, herramientas) | `posiciones:cualquiera` |

- **Puesto del reportero.** Lo que en el código se llama `Rol` (`cabeza` | `mitad` |
  `cola`) en el backend es el **`puesto`** del usuario, para no chocar con los roles de
  acceso. En el JSON de posiciones y estado se sigue llamando `rol` (contrato de §1.2).
  Con `posiciones:propias` el servidor pone el puesto y el desfile actual; el cuerpo no
  puede elegirlos.
- **Contraseñas** con hash **Argon2** (`pwdlib`). Mínimo 10 caracteres. Nunca en claro.
- **Sesión con JWT** (`pyjwt`, HS256) firmado con `JWT_SECRETO`, en
  `Authorization: Bearer <token>`. Dura 20 h (un día de desfile entero, como hoy la cookie
  del reportero). Sin refresh tokens. El token lleva solo el id del usuario: roles y
  `activo` se leen de la base en cada petición, así desactivar a alguien corta su sesión
  al instante.
- **Bearer y no cookies:** la app móvil no maneja cookies bien y el backend vive en otro
  dominio que la web. El precio: la web guarda el token en el navegador; se mitiga con la
  CSP que ya tiene la web y la duración corta.
- **Freno a fuerza bruta** en el login: espera creciente por IP (hasta 5 s), sin bloquear,
  como `frenar()` de `src/lib/sesion.ts`.
- El primer admin se crea por consola (`python -m app.cli crear-admin`).

### 1.4 La senda sigue siendo 1D

- La proyección de lat/lng a «metros desde el inicio» se hace **en Python** con `shapely`
  sobre la senda reproyectada a UTM 18N (EPSG:32618) con `pyproj`. Sin PostGIS.
- Se calcula **una vez al insertar** y se guarda en `posiciones.metros_en_senda`.
- La senda se guarda en la tabla `sendas` (GeoJSON) y se carga en memoria al arrancar.
- Paridad con la web: un fixture exportado con turf (`backend/seed/proyecciones.json`)
  garantiza que Python y TypeScript dan el mismo número (±2 m).
- **El ETA que ve el usuario se sigue calculando en el cliente** (`src/lib/eta.ts`). El
  backend solo porta `estimarVelocidad` porque la necesita para los avisos push (B43).

### 1.5 Base de datos

- PostgreSQL 16. SQLAlchemy 2 async + asyncpg. Migraciones con Alembic.
- El esquema parte de `supabase/schema.sql`, **sin** lo que es de Supabase (`auth.users`,
  RLS, `supabase_realtime`, `storage.buckets`). `reporteros` se reemplaza por `usuarios`.
  Las tablas `anunciantes` y `promociones` **no** se portan (no las usa nada).
- Posiciones: se guarda `ts` (hora del dispositivo) y `recibido_en` (reloj del servidor).
  La «última posición» de cada rol es la de **mayor `ts`**.
- **Reiniciar un desfile no borra filas** (diferencia deliberada con `trunk`, que las
  borra): se guarda `desfiles.corrida_desde` y las lecturas ignoran lo anterior. Un
  reinicio por error el 31 de diciembre no puede destruir datos.

### 1.6 Tiempo real

- SSE nativo de FastAPI: `response_class=EventSourceResponse` (`fastapi.sse`) y `yield`.
  Latido cada 20 s.
- Cada inserción en `posiciones`, cambio de estado o aviso nuevo hace
  `NOTIFY desfile_<id>`. El stream escucha con una conexión asyncpg dedicada (`LISTEN`) y
  reenvía el snapshot. Funciona igual con una réplica o con varias.

### 1.7 Frenos (rate limiting)

Los límites de hoy (emisión de dispositivos por IP, fotos por dispositivo, login) viven en
memoria del proceso, como en `trunk`. Vale porque en esta iteración Railway corre **una
sola réplica**. Si se escala a varias, hay que moverlos a Postgres (fuera de este plan).
La IP sale de la cabecera que pone Railway (`X-Real-IP` / último salto de
`X-Forwarded-For`), nunca del primer salto.

### 1.8 Fotos y push

- **Fotos:** interfaz `Almacenamiento` con dos implementaciones: disco
  (`backend/.fotos/`, desarrollo) y S3 compatible (`boto3`; un bucket de Railway o
  Cloudflare R2 en producción). Las imágenes se sirven a través de la API
  (`GET /api/fotos/{id}`), no con URL pública del bucket: así una foto pendiente nunca es
  accesible.
- **Push:** `pywebpush` con llaves VAPID (las mismas que genera `npm run push:llaves`). Sin
  llaves, la función se apaga sola, como hoy.

### 1.9 Secretos

- `sops` + `age`. Archivos `secrets/dev.enc.yaml` y `secrets/prod.enc.yaml`.
- No hay `backend/.env`: la configuración sale solo de variables de entorno, y en local
  las pone `sops exec-env`. Por eso B44 se adelanta y va justo después de B06; mientras
  tanto se exportan a mano.
- En Terraform: provider `carlpett/sops` lee `prod.enc.yaml` y lo vuelca como variables
  del servicio en Railway.
- En GitHub Actions solo existen `SOPS_AGE_KEY` y `RAILWAY_TOKEN`.
- Un hook de pre-commit rechaza cualquier archivo en `secrets/` sin cifrar.

### 1.10 Despliegue y dependencias

- Railway, provider `terraform-community-providers/railway`, un solo entorno
  (`production`), una réplica.
- Imagen construida en CI con el `Dockerfile` de `backend/`, publicada en GHCR con el SHA
  del commit. Migraciones en el pre-deploy (`alembic upgrade head`).

| Uso | Paquetes de Python 3.12 |
|---|---|
| App | `fastapi[standard]`, `pydantic-settings`, `sqlalchemy[asyncio]`, `asyncpg`, `alembic`, `pwdlib[argon2]`, `pyjwt`, `shapely`, `pyproj`, `boto3`, `pywebpush` |
| Dev | `pytest`, `pytest-asyncio`, `httpx`, `ruff`, `mypy` |

No agregues dependencias fuera de esta tabla sin decirlo en el PR.

### 1.11 Dónde este plan se aparta de la skill `fastapi`

- **SQLAlchemy 2 async en vez de SQLModel.** La app es async (SSE, LISTEN/NOTIFY) y el
  soporte async de SQLModel va un paso atrás. Los esquemas HTTP son modelos Pydantic aparte
  de las tablas.
- **mypy en vez de ty.** mypy `--strict` es lo que ya se usa en el equipo.
- **Railway, no FastAPI Cloud** (decisión de esta iteración).

Todo lo demás de la skill aplica: `Annotated` con alias de tipo para dependencias, tipos de
retorno en vez de `response_model` cuando se pueda, prefijo, tags y dependencias en el
`APIRouter`, una función por operación HTTP, nada de `...` como default ni `RootModel`, y
`def` en vez de `async def` cuando lo de adentro bloquea (Argon2, shapely, boto3).

---

## 2. Issues

Cada issue trae: **Para entender** (punto de partida de la explicación del paso 1),
**Depende de**, **Qué**, **Aceptación**, **Tests** y **Fuera de alcance**.

---

### Fase 0 — Reglas del juego

#### #3 · B01 · `docs(repo)`: agrega el plan del backend y adapta CONTRIBUTING a issues

- **Para entender:** hasta ahora el repo decía que no se usaban issues. Desde aquí cada
  cambio nace de un issue, y su número va en la rama y en el commit para poder rastrear por
  qué existe cada línea.
- **Depende de:** —
- **Qué:**
  - Sube este documento (`docs/backend/PLAN.md`).
  - `docs/CONTRIBUTING.md`: quita «el proyecto no usa issues», documenta la rama
    `<tipo>/<issue>-<desc>`, el commit `<tipo>(<alcance>): #<issue> <titulo>` con mínimo un
    bullet, y agrega los alcances `back` e `infra`.
  - `CLAUDE.md`: enlaza este plan, agrega los comandos del backend («cuando exista») y la
    skill `fastapi` a la tabla («Backend (FastAPI)»).
  - Sube la skill `fastapi` (`.agents/skills/fastapi/`, el enlace en `.claude/skills/` y
    `skills-lock.json`).
- **Aceptación:** los tres documentos dicen lo mismo sobre ramas y commits.
- **Fuera de alcance:** código.

---

### Fase 1 — Base mínima (que exista un servidor)

#### #4 · B02 · `chore(back)`: agrega el entorno de desarrollo con Nix

- **Para entender:** Nix describe en un archivo (`flake.nix`) exactamente qué herramientas
  y versiones necesita el proyecto. `nix develop` abre una terminal con todas ellas, igual
  en tu máquina, en la de otro y en el CI, sin instalar nada global. `flake.lock` congela
  las versiones, como `package-lock.json` en npm.
- **Depende de:** B01
- **Qué:** `flake.nix` en la raíz con `devShells.default`: `python312`, `uv`,
  `postgresql_16`, `sops`, `age`, `pre-commit`, `terraform`, `tflint`, `gitleaks`,
  `nixfmt-rfc-style`, `nodejs_22`. `flake.lock` commiteado. `.envrc` con `use flake`
  (opcional, para direnv). `.direnv/` en `.gitignore`.
- **Aceptación:** `nix develop -c python --version` muestra 3.12; `nix develop -c uv --version`
  funciona.
- **Fuera de alcance:** construir la imagen con Nix (va por Dockerfile, B45).

#### #5 · B03 · `chore(back)`: crea el esqueleto de FastAPI con endpoint de salud

- **Para entender:** FastAPI es un framework web de Python: defines funciones y las decoras
  con la ruta. Usa los tipos de Python para validar lo que entra y documentar lo que sale
  (genera `/docs` solo). `uv` es el gestor de paquetes: `pyproject.toml` lista lo que se
  necesita y `uv.lock` congela versiones. `/api/salud` es lo que Railway consulta para
  saber si el servidor está vivo.
- **Depende de:** B02
- **Qué:** `backend/` con `pyproject.toml` (dependencias de §1.10, `uv.lock`), `app/main.py`
  con `GET /api/salud` → `{"ok": true}`, pytest (`asyncio_mode = "auto"`), ruff y mypy en
  `pyproject.toml`, `[tool.fastapi] entrypoint = "app.main:app"`; se arranca con
  `uv run fastapi dev`.
- **Aceptación:** `cd backend && uv run pytest` pasa y `uv run fastapi dev` abre `/docs`.
- **Tests:** `test_salud_ok`, `test_salud_falla` (POST → 405).
- **Fuera de alcance:** base de datos, configuración.

#### #6 · B04 · `chore(back)`: configura pre-commit

- **Para entender:** pre-commit corre revisiones automáticas en cada `git commit`; si una
  falla, el commit no se hace. Así formato, tipos y secretos filtrados se atajan en tu
  máquina. `ruff` formatea y detecta errores comunes, `mypy` revisa tipos, `gitleaks`
  busca llaves pegadas por error.
- **Depende de:** B03
- **Qué:** `.pre-commit-config.yaml` en la raíz con hooks locales que usan las herramientas
  del flake:
  - `ruff check --fix` y `ruff format` sobre `^backend/`
  - `mypy --strict` sobre `^backend/app/`
  - `gitleaks protect --staged`
  - `nixfmt` sobre `*.nix`
  - `trailing-whitespace`, `end-of-file-fixer`, `check-yaml`, `check-merge-conflict`
  - `sops-cifrado`: falla si un archivo en `^secrets/` no tiene la clave `sops:`
    (`scripts/verificar-sops.sh`)
  - `terraform fmt -check` sobre `^infra/` (listo aunque `infra/` no exista aún)
- **Aceptación:** `nix develop -c pre-commit run --all-files` pasa en el repo actual.
- **Fuera de alcance:** lint de la web.

#### #7 · B05 · `chore(ci)`: agrega el CI del backend en GitHub Actions

- **Para entender:** el CI es una máquina de GitHub que, en cada PR, corre los mismos
  chequeos que corres en local. Si algo falla, el PR se ve en rojo. Usa el mismo
  `flake.nix`, así que «en mi máquina funciona» y «en el CI funciona» significan lo mismo.
- **Depende de:** B04
- **Qué:** `.github/workflows/backend-ci.yml`. En `pull_request` hacia `trunk` cuando cambian
  `backend/**`, `flake.*`, `.pre-commit-config.yaml` o el workflow:
  `DeterminateSystems/nix-installer-action` + `magic-nix-cache-action`, luego
  `nix develop -c pre-commit run --all-files` y
  `nix develop -c bash -c "cd backend && uv sync --frozen && uv run pytest"`.
- **Aceptación:** el PR de este issue muestra el job en verde.
- **Fuera de alcance:** build de imagen, despliegue.

#### #8 · B06 · `feat(back)`: carga la configuración desde variables de entorno

- **Para entender:** lo que cambia entre tu máquina y producción (URL de la base, secreto
  del JWT) no va en el código: va en variables de entorno. `pydantic-settings` las lee al
  arrancar y las valida; si falta una obligatoria, el servidor no arranca y dice cuál.
- **Depende de:** B03
- **Qué:** `app/config.py`: `DATABASE_URL` y `JWT_SECRETO` (obligatorias, el secreto con
  mínimo 32 caracteres), `JWT_HORAS` (20), `CORS_ORIGENES` (`http://localhost:3000`),
  `ENTORNO` (`dev` | `prod`). Opcionales para más adelante: `VAPID_PUBLICA`,
  `VAPID_PRIVADA`, `VAPID_CONTACTO`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_LLAVE`,
  `S3_SECRETO`. Solo lee variables de entorno, sin archivo `.env` (ver §1.9).
  `get_settings()` con `lru_cache` como dependencia. CORS montado en `main.py`.
- **Tests:** `test_config_ok`, `test_config_falla` (sin `DATABASE_URL` → `ValidationError`).
- **Fuera de alcance:** sops (B44).

#### #9 · B07 · `feat(back)`: conecta a Postgres con SQLAlchemy async y Alembic

- **Para entender:** SQLAlchemy es la capa que habla con Postgres desde Python; en modo
  async no bloquea el servidor mientras espera a la base. Alembic versiona el esquema: cada
  cambio de tablas es un archivo de migración numerado que se aplica (`upgrade`) o se
  revierte (`downgrade`), como commits pero para la base. `scripts/db-local.sh` levanta un
  Postgres de desarrollo con el del flake, sin Docker.
- **Depende de:** B06
- **Qué:** `app/db.py` (engine async, `get_sesion()` como dependencia con `yield`), Alembic
  en `backend/migraciones/` en modo async. `scripts/db-local.sh` (`initdb` + `pg_ctl` en
  `backend/.pgdata/`). `/api/salud` pasa a `{"ok": bool, "db": bool, "hora": epoch_ms}` con
  `SELECT 1`; sin base responde 503, como hoy.
- **Aceptación:** `scripts/db-local.sh && uv run alembic upgrade head` funciona en limpio.
- **Tests:** `test_salud_db_ok`, `test_salud_db_falla` (sesión falsa que lanza error → 503).
- **Fuera de alcance:** tablas.

#### #10 · B08 · `feat(back)`: responde todos los errores con el mismo formato

- **Para entender:** FastAPI responde los errores de validación con su propia estructura
  (`{"detail": [...]}`). La web espera `{"error": "..."}`. Un *exception handler*
  intercepta los errores antes de salir y los reescribe, para que todos los endpoints
  respondan igual sin repetirlo en cada uno. Los errores inesperados se registran en el log
  (como `errorInterno` de `src/lib/api/respuestas.ts`).
- **Depende de:** B03
- **Qué:** `app/errores.py` con handlers para `HTTPException`, `RequestValidationError` y
  `Exception` → `{"error": "<mensaje en español>"}`, registrados en `main.py`.
- **Tests:** `test_error_http_ok` (un 404 sale como `{"error": ...}`),
  `test_error_validacion_falla` (query inválida → 422 con `error`, sin `detail`).

---

### Fase 2 — Usuarios y roles

#### #11 · B09 · `feat(back)`: crea las tablas de usuarios y sus roles

- **Para entender:** es la primera migración real. `usuarios` guarda quién es cada
  persona del equipo; `usuario_roles` dice qué roles tiene (puede tener varios: alguien
  puede ser editor y moderador). La contraseña nunca se guarda, solo su hash.
- **Depende de:** B07
- **Qué:** modelos y migración `0001_usuarios`:
  - `usuarios`: `id uuid`, `email text unique` (en minúsculas), `nombre`, `password_hash`,
    `puesto` (check `cabeza` | `mitad` | `cola`, nulo), `activo bool default true`,
    `ultima_senal_en timestamptz null`, `creado_en`.
  - `usuario_roles`: `usuario_id` (FK, `on delete cascade`), `rol` (check con los seis
    roles de §1.3), PK compuesta.
- **Aceptación:** `alembic upgrade head` y `alembic downgrade base` funcionan.
- **Fuera de alcance:** login.

#### #12 · B10 · `feat(back)`: hashea y verifica contraseñas con Argon2

- **Para entender:** un hash es una transformación de un solo sentido: de la contraseña sale
  el hash, pero del hash no se vuelve a la contraseña. Para verificar un login se hashea lo
  que escribió la persona y se compara. Argon2 es lento a propósito, para que si alguien
  roba la base no pueda probar millones de contraseñas por segundo.
- **Depende de:** B03
- **Qué:** en `app/seguridad.py`, `hashear_password(texto) -> str` y
  `verificar_password(texto, hash) -> bool` con `pwdlib` (Argon2). `validar_password`
  exige mínimo 10 caracteres.
- **Tests:** `test_verificar_password_ok`, `test_verificar_password_falla` y
  **específico**: `test_mismo_texto_da_hashes_distintos` (la sal aleatoria).

#### #13 · B11 · `feat(back)`: define los roles y sus permisos

- **Para entender:** en vez de que cada endpoint pregunte «¿es admin o coordinador?», cada
  uno pide un **permiso** («¿puede cambiar el estado del desfile?»). Una sola tabla en
  código dice qué permisos da cada rol. Agregar un rol o mover un permiso es cambiar esa
  tabla, no buscar `if` por todo el código.
- **Depende de:** B03
- **Qué:** `app/permisos.py` con `Rol` y `Permiso` (`StrEnum`), `PERMISOS_POR_ROL` (la
  tabla de §1.3) y `permisos_de(roles) -> set[Permiso]`. `admin` tiene todos los permisos
  por construcción, no por lista.
- **Tests:** `test_permisos_de_ok` (editor + moderador suman los dos conjuntos),
  `test_permisos_de_falla` (reportero no tiene `desfiles:estado`) y **específico**:
  `test_admin_tiene_todos_los_permisos` (recorre `Permiso`: si alguien agrega uno, el admin
  lo tiene).

#### #14 · B12 · `feat(back)`: agrega el repositorio de usuarios

- **Para entender:** un repositorio esconde la base de datos detrás de funciones simples
  (`crear`, `por_email`). Las rutas hablan con el repositorio, no con SQL. Hay dos
  implementaciones de la misma interfaz: Postgres (la real) y una en memoria que usan los
  tests, para que sean rápidos y no necesiten base.
- **Depende de:** B09
- **Qué:** `app/repositorios/usuarios.py` con un `Protocol` (`crear`, `por_email`,
  `por_id`, `listar`, `actualizar`, `fijar_roles`, `eliminar`, `marcar_senal`),
  `UsuariosPostgres` y `UsuariosMemoria`. Alias `RepoUsuariosDep`.
- **Tests (memoria):** `test_crear_usuario_ok`, `test_crear_usuario_falla` (correo
  repetido → `UsuarioYaExiste`) y **específico**: `test_email_no_distingue_mayusculas`.

#### #15 · B13 · `feat(back)`: crea el primer admin desde la consola

- **Para entender:** para crear usuarios hace falta ser admin, pero al principio no existe
  ninguno: el huevo y la gallina. Se resuelve con un comando que se corre a mano una sola
  vez y que pide la contraseña sin mostrarla en pantalla.
- **Depende de:** B10, B11, B12
- **Qué:** `python -m app.cli crear-admin --email X --nombre Y` (contraseña con `getpass`,
  pedida dos veces).
- **Tests:** `test_crear_admin_ok`, `test_crear_admin_falla` (contraseña corta → sale con
  error y no crea nada).

#### #16 · B14 · `feat(back)`: agrega el login con correo y contraseña

- **Para entender:** el login verifica la contraseña y devuelve un **JWT**: un texto firmado
  con `JWT_SECRETO` que dice «soy el usuario X, válido hasta tal hora». El cliente lo manda
  en cada petición (`Authorization: Bearer ...`) y el servidor revisa la firma. Si alguien
  lo modifica, la firma deja de cuadrar. Roles y `activo` no van en el token: se leen de la
  base, así desactivar a alguien lo saca al instante.
- **Depende de:** B06, B13
- **Qué:** `POST /api/auth/login` con `{email, password}` → `{token, expiraEn, usuario}`
  (usuario con `id`, `email`, `nombre`, `roles`, `permisos`, `puesto`). `GET /api/auth/yo`
  devuelve lo mismo sin token nuevo. `crear_token` / `leer_token` en `app/seguridad.py`.
  Dependencia `UsuarioActualDep` (token válido, usuario existe y activo). Correo
  inexistente y contraseña mala responden igual: 401 «Correo o contraseña incorrectos.».
- **Tests:** `test_login_ok`, `test_login_falla` (contraseña mala → 401) y **específico**:
  `test_usuario_desactivado_pierde_la_sesion` (token válido, usuario desactivado → 401).

#### #17 · B15 · `feat(back)`: protege las rutas por permiso

- **Para entender:** en FastAPI la protección se hace con **dependencias**: una función que
  corre antes del endpoint y corta con 401 (no sé quién eres) o 403 (sé quién eres pero no
  puedes). Los routers solo declaran el permiso que piden:
  `APIRouter(dependencies=[requiere(Permiso.FOTOS_MODERAR)])`.
- **Depende de:** B11, B14
- **Qué:** `requiere(*permisos)` en `app/seguridad.py` (todos los permisos pedidos son
  necesarios) y alias `UsuarioConPermiso`. Mensajes como hoy: 401 «Hace falta iniciar
  sesión.», 403 «No tenés permiso para esto.».
- **Tests:** `test_requiere_ok`, `test_requiere_falla` (moderador pidiendo
  `desfiles:estado` → 403) y **específico**: `test_sin_token_es_401_y_no_403`.

#### #39 · B16 · `feat(back)`: frena los intentos de login a lo bruto

- **Para entender:** si alguien prueba contraseñas a lo bruto, cada fallo reciente desde su
  IP hace que la siguiente respuesta tarde más (hasta 5 s). No bloquea a nadie: bloquear
  por IP dejaba fuera al admin real cuando muchos comparten la IP de un operador móvil (ver
  el comentario de `frenar()` en `src/lib/sesion.ts`).
- **Depende de:** B14
- **Qué:** `app/frenos.py` con `ip_de(request)` (§1.7) y `FrenoLogin` (`esperar(ip)`,
  `registrar(ip, ok)`, ventana 10 min, 500 ms por fallo, tope 5 s, poda del mapa). Usado en
  `/api/auth/login`. El reloj y el `sleep` se inyectan para poder probarlo sin esperar.
- **Tests:** `test_freno_ok` (sin fallos no espera), `test_freno_falla` (3 fallos → 1,5 s)
  y **específico**: `test_ip_es_el_ultimo_salto_de_forwarded_for`.

#### #40 · B17 · `feat(back)`: permite gestionar usuarios desde la API

- **Para entender:** con login y permisos listos, el equipo se da de alta desde la API en
  vez de la consola. Desactivar en lugar de borrar conserva el historial de quién reportó
  qué. Reemplaza `/api/admin/reporteros` y los códigos de acceso.
- **Depende de:** B15
- **Qué:** router `/api/admin/usuarios`:
  - `GET` (`usuarios:ver`): lista con `ultimaSenalEn`, nunca `password_hash`.
  - `POST` (`usuarios:gestionar`): `{email, nombre, password, roles, puesto}`.
  - `PATCH /{id}` (`usuarios:gestionar`): `nombre`, `roles`, `puesto`, `activo`, `password`
    (restablecer).
  - `DELETE /{id}` (`usuarios:gestionar`): solo si nunca mandó posiciones; si no, 409 y se
    pide desactivar.
  - Validación: `reportero` exige `puesto`; nadie se quita a sí mismo el rol `admin`.
- **Tests:** `test_crear_usuario_ok`, `test_crear_usuario_falla` (editor intenta → 403) y
  **específico**: `test_reportero_sin_puesto_es_422`.
- **Fuera de alcance:** recuperar contraseña por correo.

---

### Fase 3 — Senda y desfiles

#### #18 · B18 · `feat(back)`: crea las tablas sendas y desfiles

- **Para entender:** la senda es la ruta física (una línea en GeoJSON); un desfile es un
  día concreto que recorre una senda, con fecha, hora y estado (`programado`, `en_curso`,
  `finalizado`). `corrida_desde` marca desde cuándo cuentan las posiciones, para reiniciar
  sin borrar (§1.5).
- **Depende de:** B09
- **Qué:** migración `0002`: `sendas` y `desfiles` como en `supabase/schema.sql`, más
  `desfiles.corrida_desde timestamptz not null default now()`.
- **Aceptación:** migración ida y vuelta.

#### #19 · B19 · `feat(back)`: exporta los datos de la web y siembra la base

- **Para entender:** la senda y los datos de ejemplo hoy viven en `src/data/`. Un script los
  exporta a JSON para que el backend los cargue, y de paso guarda puntos de prueba
  calculados con turf para comprobar después que Python da los mismos metros. «Sembrar» es
  cargar los datos iniciales; idempotente significa que correrlo dos veces deja lo mismo.
- **Depende de:** B18
- **Qué:**
  - `scripts/exportar-semilla.ts` (con `tsx`): escribe en `backend/seed/` `senda.json` (con
    hitos ya proyectados), `desfiles.json`, `eventos.json`, `comercios.json` (desde
    `src/data/*-ejemplo.json`) y `proyecciones.json` (~10 puntos con `metros` y `desvioM`
    de turf: uno antes del inicio, uno después del final, uno a 300 m de la senda).
  - `python -m app.cli sembrar`: inserta senda y desfiles. Eventos y comercios los siembra
    cada issue que crea su tabla (B36, B37).
  - `app/repositorios/desfiles.py` (Protocol + Postgres + memoria) con lo que usa la siembra.
- **Tests:** `test_sembrar_ok`, `test_sembrar_falla` (senda.json sin `geojson` → error
  claro) y **específico**: `test_sembrar_dos_veces_no_duplica`.
- **Fuera de alcance:** datos reales (siguen siendo de ejemplo).

#### #20 · B20 · `feat(back)`: proyecta puntos sobre la senda en metros

- **Para entender:** es la idea central del proyecto (README, «la senda es 1D»): cualquier
  lat/lng se pega al punto más cercano de la ruta y se reduce a «metros desde el inicio».
  Los grados no son metros, así que primero la senda se pasa a UTM 18N, un sistema de
  coordenadas en metros para la zona de Pasto, y ahí `shapely` mide.
- **Depende de:** B19
- **Qué:** `app/dominio/senda.py`: `Senda.desde_geojson(...)`, `metros_en_senda(lat, lng)
  -> Proyeccion(metros, desvio_m, lat, lng)`, `punto_en_metro(metros)`, `longitud_metros`,
  `hitos` y `hito_por_id`. Constante `DESVIO_MAX_USUARIO_M` igual a la de `src/lib/senda.ts`.
- **Tests:** `test_metros_en_senda_ok`, `test_metros_en_senda_falla` (lat fuera de rango →
  `ValueError`) y **específico**: `test_paridad_con_turf` (±2 m sobre
  `seed/proyecciones.json`).
- **Fuera de alcance:** frases de referencia («va por Cristo Rey»): las pinta la web.

#### #21 · B21 · `feat(back)`: expone la senda en GET /api/senda

- **Para entender:** la senda casi no cambia, así que se responde con `Cache-Control` para
  que el navegador y el service worker la guarden y no la pidan en cada carga.
- **Depende de:** B20
- **Qué:** misma respuesta que `src/app/api/senda/route.ts`, con el mismo `Cache-Control`.
- **Tests:** `test_senda_ok`, `test_senda_falla` (sin senda cargada → 503 con `error`).

#### #22 · B22 · `feat(back)`: resuelve el desfile actual y expone la programación

- **Para entender:** el Carnaval tiene un desfile por día y la app no pregunta cuál ver:
  muestra el que está pasando, o el de hoy, o el próximo, o el último que hubo (regla de
  `src/lib/desfiles.ts`). «Hoy» se calcula en hora de Pasto, no con el reloj del servidor
  (que en Railway está en UTC).
- **Depende de:** B19
- **Qué:**
  - `app/dominio/fecha.py`: `hoy_en_pasto(ts)` y `normalizar_hora` (port de `src/lib/fecha.ts`).
  - `app/dominio/desfiles.py`: `desfile_actual(desfiles, hoy)`.
  - `resolver_desfile(id | None)` como dependencia, con caché de 2 s de la lista (como
    `listarDesfilesCacheado`).
  - `GET /api/programacion` → `{desfiles, eventos: [], hoy, actualId}` (los eventos llegan
    en B36).
- **Tests:** `test_desfile_actual_ok` (hay uno en curso → ese),
  `test_desfile_actual_falla` (lista vacía → `None`) y **específico**:
  `test_hoy_en_pasto_a_las_8_pm_sigue_siendo_hoy` (01:00 UTC del día siguiente).

#### #41 · B23 · `feat(back)`: permite administrar los desfiles

- **Para entender:** el estado del desfile lo cambia una persona, no el código. Reiniciar
  (volver a `programado`) mueve `corrida_desde` a «ahora»: las posiciones viejas quedan
  guardadas pero no se muestran. Crear o editar nombre, fecha y hora es otro permiso,
  porque lo hace otra persona (quien carga la programación).
- **Depende de:** B15, B22
- **Qué:** port de `src/app/api/admin/desfiles/`: `GET` y `PUT /{id}` (`desfiles:editar`,
  validación de `validarDesfile` en `src/lib/programacion.ts`), `PATCH /{id}` con
  `{accion: "iniciar" | "finalizar" | "reiniciar"}` (`desfiles:estado`), `DELETE /{id}`
  (`desfiles:editar`).
- **Tests:** `test_accion_desfile_ok`, `test_accion_desfile_falla` (editor intenta iniciar
  → 403) y **específico**: `test_reiniciar_mueve_corrida_desde`.

---

### Fase 4 — El desfile en vivo

#### #23 · B24 · `feat(back)`: crea las tablas posiciones y presencias

- **Para entender:** `posiciones` es el historial de dónde estuvo cada reportero (la tabla
  que más escribe); `presencias` es una fila por celular del público con el tramo de 100 m
  donde está, que se sobrescribe y nunca guarda lat/lng (README, «Mapa de gentío»).
- **Depende de:** B18
- **Qué:** migración `0003`: `posiciones` como en el schema actual con `usuario_id` (FK a
  `usuarios`) en vez de `reportero_id`, más `ts timestamptz not null` y
  `recibido_en timestamptz default now()`, índice `(desfile_id, rol, ts desc)`.
  `presencias` igual que en el schema actual.
- **Aceptación:** migración ida y vuelta.

#### #24 · B25 · `feat(back)`: define los esquemas del estado del desfile

- **Para entender:** son las «formas» del JSON que entra y sale, escritas como clases
  Pydantic. Validan solas (un `rol` raro o una `lat` de 200 se rechazan antes de llegar al
  código) y salen en camelCase para que la web reciba exactamente lo que espera hoy.
- **Depende de:** B08
- **Qué:** `app/esquemas/` con `EntradaPosicion` (con `hitoId` opcional), `Posicion`,
  `MuestraHistorial`, `EstadoDesfile` (con `fecha`, `horaInicio`, `avisos`), `Aviso`,
  `Desfile`, `Densidad`, `BinDensidad`, según `src/lib/tipos.ts`.
- **Tests:** `test_entrada_posicion_ok`, `test_entrada_posicion_falla` (rol `"cola2"`) y
  **específico**: `test_estado_serializa_en_camelcase`.

#### #25 · B26 · `feat(back)`: agrega el repositorio del estado del desfile

- **Para entender:** es el equivalente en Python de la parte «en vivo» de `AdaptadorDatos`
  (`src/lib/datos/adaptador.ts`). Aquí viven las reglas de §1.5: la última posición es la
  de mayor `ts`, se respeta `corrida_desde` y el primer reporte de un desfile programado lo
  pasa a `en_curso`.
- **Depende de:** B23, B24, B25
- **Qué:** `app/repositorios/estado.py` (Protocol + Postgres + memoria):
  `registrar_posiciones(entradas, usuario_id)`, `leer_estado`, `ultimo_emisor(desfile, rol)`,
  `leer_recorrido`, `registrar_presencia`, `leer_presencias`. Actualiza
  `usuarios.ultima_senal_en`.
- **Tests (memoria):** `test_registrar_posiciones_ok`, `test_registrar_posiciones_falla`
  (desfile inexistente → `DesfileNoExiste`) y **específico**:
  `test_paquete_viejo_no_pisa_al_nuevo`.
- **Fuera de alcance:** NOTIFY (B30).

#### #26 · B27 · `feat(back)`: valida los lotes de posiciones

- **Para entender:** el celular del reportero guarda los envíos que fallan y los manda
  después en lote. Un punto malo no puede tumbar el lote entero (la cola quedaría atascada
  reintentando lo mismo): se descarta y se cuenta. Es lógica pura, sin base ni HTTP.
- **Depende de:** B20, B25
- **Qué:** `app/dominio/posiciones.py` con `validar_lote(cuerpo, rol_forzado, desfile_id,
  ahora, senda)` → `(entradas, descartadas)` o error, port exacto de `validar()` en
  `src/app/api/posiciones/route.ts`: `MAX_LOTE` 200, `hitoId` → punto de la senda,
  descarta futuro > 2 min, más viejo que 1 h y precisión > `PRECISION_MAX_M`; ordena por `ts`.
- **Tests:** `test_validar_lote_ok`, `test_validar_lote_falla` (201 puntos → error) y
  **específico**: `test_punto_con_mala_precision_se_descarta_sin_tumbar_el_lote`.

#### #42 · B28 · `feat(back)`: recibe posiciones en POST /api/posiciones

- **Para entender:** es la única puerta de entrada de posiciones. Un reportero solo puede
  mandar su puesto y siempre al desfile actual. Si dos reporteros tienen el mismo puesto,
  el que está mandando es el titular y el otro queda en espera hasta que el titular se
  calle un minuto (**relevo**): si no, la cabeza saltaría entre dos celulares a cuadras de
  distancia.
- **Depende de:** B15, B26, B27
- **Qué:** port de `src/app/api/posiciones/route.ts`. Con `posiciones:propias` el puesto y
  el desfile los pone el servidor y aplica el relevo (`RELEVO_MS`); con
  `posiciones:cualquiera` el cuerpo puede nombrar desfile (que tiene que existir) y rol.
  Respuesta `{ok, guardadas, descartadas, enEspera, servidorTs}`.
- **Tests:** `test_posiciones_ok`, `test_posiciones_falla` (sin token → 401) y
  **específico**: `test_segundo_reportero_del_mismo_puesto_queda_en_espera`.
- **Fuera de alcance:** avisos push al recibir la cabeza (B43).

#### #27 · B29 · `feat(back)`: expone el snapshot en GET /api/estado

- **Para entender:** el snapshot es la foto completa del desfile ahora: dónde va cada
  parte, los últimos 16 min de la cabeza (con eso la web calcula el ETA), los avisos y la
  hora del servidor (para no depender del reloj del celular).
- **Depende de:** B22, B26
- **Qué:** `?desfile=` opcional (sin él, el actual), 404 «No hay desfile.», mismo
  `Cache-Control` que la ruta actual en producción.
- **Tests:** `test_estado_ok`, `test_estado_falla` (sin desfiles → 404).

#### #28 · B30 · `feat(back)`: transmite el estado en vivo por SSE

- **Para entender:** SSE (Server-Sent Events) es una conexión HTTP que queda abierta y por
  la que el servidor empuja mensajes cuando hay novedades, en vez de que el celular pregunte
  cada pocos segundos. Para que funcione con varias instancias, Postgres avisa: al guardar
  una posición se hace `NOTIFY`, y cada servidor con streams abiertos escucha con `LISTEN`
  y reenvía.
- **Depende de:** B29
- **Qué:** `GET /api/estado/stream` con `EventSourceResponse`. Primer evento inmediato con el
  snapshot; uno por cada `NOTIFY desfile_<id>`; latido cada 20 s. El repositorio Postgres
  hace `NOTIFY` al registrar posiciones y al cambiar estado. `app/tiempo_real.py` abstrae
  el escuchar para poder usar un falso en tests.
- **Tests:** `test_stream_ok` (primer evento es el snapshot), `test_stream_falla` (sin
  desfile → 404 antes de abrir el stream).
- **Fuera de alcance:** WebSockets.

#### #43 · B31 · `feat(back)`: expone el recorrido del desfile por hitos

- **Para entender:** con todo el historial de la cabeza se puede decir a qué hora pasó por
  cada punto de referencia («pasó por Cristo Rey a las 3:40»). Es lo que muestra la web
  cuando el desfile ya pasó por donde estás.
- **Depende de:** B20, B26
- **Qué:** `app/dominio/recorrido.py` con `pasos_por_hito` (port de `src/lib/recorrido.ts`)
  y `GET /api/desfiles/{id}/recorrido` → `{desfile, pasos}`, mismo `Cache-Control`.
- **Tests:** `test_pasos_por_hito_ok`, `test_pasos_por_hito_falla` (recorrido vacío → sin
  pasos) y **específico**: `test_hito_no_alcanzado_no_aparece`.

#### #29 · B32 · `feat(back)`: porta el cálculo de densidad por tramos

- **Para entender:** la senda se parte en tramos de 100 m y se cuenta cuántos celulares hay
  en cada uno. Las salvaguardas del README se mantienen: con menos de 50 usuarios no se
  pinta nada, y un tramo con menos de 3 reportes queda sin dato (no es lo mismo que vacío).
- **Depende de:** B20
- **Qué:** `app/dominio/densidad.py` y `app/dominio/constantes.py` con las mismas
  constantes y reglas que `src/lib/densidad.ts` y `src/lib/tipos.ts`. Cada constante con un
  comentario apuntando al archivo TS de origen: si cambia uno, cambia el otro.
- **Tests:** `test_clasificar_ok` (60 usuarios → bins con niveles), `test_clasificar_falla`
  (40 usuarios → `suficiente=False`) y **específico**:
  `test_tramo_con_pocas_muestras_no_aparece`.

#### #44 · B33 · `feat(back)`: emite ids de dispositivo firmados

- **Para entender:** el gentío y las fotos cuentan dispositivos. Si el celular inventara su
  propio id, un script podría mandar mil y pintar un tramo de «lleno». Por eso el id lo
  emite el servidor, firmado con HMAC, y emitir tiene tope por IP. Es anónimo: no dice nada
  de la persona.
- **Depende de:** B16
- **Qué:** `POST /api/dispositivo` → `{dispositivo}` o 429; `emitir_dispositivo` y
  `dispositivo_valido` (port de `src/lib/sesion.ts`, firmado con una clave derivada de
  `JWT_SECRETO`); tope de 300 por IP por hora en `app/frenos.py`.
- **Tests:** `test_dispositivo_valido_ok`, `test_dispositivo_valido_falla` (firma alterada →
  `None`) y **específico**: `test_emision_301_desde_la_misma_ip_es_429`.

#### #30 · B34 · `feat(back)`: recibe y agrega el gentío en /api/densidad

- **Para entender:** el `POST` es anónimo (cualquier celular con un id emitido aporta su
  tramo) y el `GET` devuelve solo el agregado, nunca filas crudas, para que nadie pueda
  reconstruir por dónde anduvo un dispositivo.
- **Depende de:** B22, B26, B32, B33
- **Qué:** port de `src/app/api/densidad/route.ts`, siempre sobre el desfile actual. `POST
  {dispositivo, bin}`: dispositivo inválido → 401 (el cliente pide uno nuevo); upsert por
  dispositivo; borra presencias fuera de la ventana en el mismo `POST` (sin cron).
- **Tests:** `test_densidad_post_ok`, `test_densidad_post_falla` (`bin` fuera de la senda →
  400) y **específico**: `test_mismo_dispositivo_cuenta_una_vez`.

---

### Fase 5 — Contenido y comunidad

#### #45 · B35 · `feat(back)`: publica avisos del equipo para todos

- **Para entender:** un aviso es un mensaje del equipo que sale arriba del mapa («arranca
  con 40 min de retraso»). Viaja dentro del estado del desfile, así que al publicarlo hay
  que avisar al stream para que llegue al instante.
- **Depende de:** B15, B30
- **Qué:** tabla `avisos` (migración), repositorio, `GET/POST /api/admin/avisos` y
  `DELETE /api/admin/avisos/{id}` (`avisos:gestionar`, validación de `validarAviso`). Los
  vigentes se incluyen en `EstadoDesfile.avisos`; publicar o borrar hace `NOTIFY`.
- **Tests:** `test_publicar_aviso_ok`, `test_publicar_aviso_falla` (texto vacío → 400) y
  **específico**: `test_aviso_vencido_no_sale_en_el_estado`.

#### #46 · B36 · `feat(back)`: administra los eventos de la programación

- **Para entender:** además de los desfiles, la programación tiene tarimas, tascas y
  eventos culturales. Se cargan desde el panel y salen en la pestaña «Hoy» de la web.
- **Depende de:** B15, B22
- **Qué:** tabla `eventos` (migración, sin `anunciante_id`), repositorio, siembra desde
  `seed/eventos.json`, `GET/PUT/DELETE /api/admin/eventos` (`programacion:editar`,
  validación de `validarEvento`), y `GET /api/programacion` pasa a incluirlos.
- **Tests:** `test_guardar_evento_ok`, `test_guardar_evento_falla` (categoría inválida →
  400).

#### #47 · B37 · `feat(back)`: administra los comercios y servicios del mapa

- **Para entender:** la capa de comercios reúne negocios y servicios (baños, agua). Aparecer
  en el mapa nunca depende de pagar; el plan solo da la oferta, el menú y los enlaces (ver
  README, «Comercios en el mapa»). El público solo ve los visibles.
- **Depende de:** B15, B19
- **Qué:** tabla `comercios` (migración), repositorio, siembra desde `seed/comercios.json`,
  `GET /api/comercios` (solo visibles, mismo `Cache-Control`) y
  `GET/PUT/DELETE /api/admin/comercios` (`comercios:editar`), port de `validarComercio`
  (`src/lib/comercios.ts`).
- **Tests:** `test_guardar_comercio_ok`, `test_guardar_comercio_falla` (lat fuera de rango
  → 400) y **específico**: `test_servicio_nunca_lleva_plan_ni_oferta`.

#### #48 · B38 · `feat(back)`: cuenta las interacciones con los comercios

- **Para entender:** al anunciante se le muestra cuántas veces abrieron su ficha o tocaron
  su WhatsApp. Solo se suma un contador: no se guarda quién fue ni desde dónde. Que el
  contador falle no puede romperle el mapa a nadie.
- **Depende de:** B37
- **Qué:** tabla `comercio_metricas` (migración), `POST /api/comercios/evento` (siempre
  `{ok: true}`, aunque falle por dentro) y las métricas en `GET /api/admin/comercios`
  (`metricas:ver`), como hoy.
- **Tests:** `test_sumar_metrica_ok`, `test_sumar_metrica_falla` (tipo inválido → 400).

#### #49 · B39 · `feat(back)`: guarda las fotos en disco o en S3

- **Para entender:** las fotos no van en la base: van en un almacenamiento de archivos. En
  desarrollo, una carpeta; en producción, un bucket S3 (el estándar que usan Railway,
  Cloudflare R2 y AWS). Una interfaz común deja cambiar uno por otro con una variable de
  entorno.
- **Depende de:** B06
- **Qué:** `app/almacenamiento.py` con `Protocol` (`guardar`, `leer`, `borrar`),
  `AlmacenamientoDisco` y `AlmacenamientoS3` (`boto3`), elegido por si existe `S3_BUCKET`.
- **Tests (con disco en `tmp_path`):** `test_guardar_y_leer_ok`, `test_leer_falla`
  (id inexistente → `None`).
- **Fuera de alcance:** crear el bucket (B48).

#### #50 · B40 · `feat(back)`: recibe y muestra las fotos del público

- **Para entender:** cualquiera puede subir una foto, pero queda **pendiente**: nada se
  publica sin moderación. Se exige un id de dispositivo, se limita a 8 por hora, y se mira
  que el archivo sea de verdad un JPEG (sus tres primeros bytes), sin confiar en lo que
  diga el navegador.
- **Depende de:** B22, B33, B39
- **Qué:** tabla `fotos` (migración, `storage_path`), repositorio, port de
  `src/app/api/fotos/route.ts` y `fotos/[id]/route.ts`: `POST` multipart (dispositivo, peso
  máximo 1,5 MB, JPEG, `metros` opcional), `GET` aprobadas, `GET /{id}` sirve la imagen
  (pendiente o rechazada → 404 salvo con `fotos:moderar`).
- **Tests:** `test_subir_foto_ok`, `test_subir_foto_falla` (PNG → 415) y **específico**:
  `test_foto_pendiente_no_es_publica`.

#### #51 · B41 · `feat(back)`: permite moderar las fotos

- **Para entender:** el contenido inapropiado bajo el nombre del Carnaval es un problema
  reputacional, no un detalle. Quien tiene el rol `moderador` aprueba, rechaza o borra.
- **Depende de:** B15, B40
- **Qué:** `GET /api/admin/fotos` (pendientes primero), `PATCH /{id}` con `{estado}` y
  `DELETE /{id}` (borra también el archivo), con `fotos:moderar`.
- **Tests:** `test_moderar_foto_ok`, `test_moderar_foto_falla` (reportero → 403).

#### #52 · B42 · `feat(back)`: guarda las suscripciones a avisos push

- **Para entender:** «avisame cuando el desfile esté cerca». El navegador entrega una
  *suscripción* (a dónde mandar la notificación y con qué llaves) y la persona dice en qué
  metro de la senda espera. Nada más: ni nombre ni cuenta.
- **Depende de:** B22, B20
- **Qué:** tabla `suscripciones_aviso` (migración), repositorio, port de
  `src/app/api/avisos-push/route.ts`: `GET` (configurado y llave pública), `POST`
  (validaciones y `umbralMin` acotado a 5–60), `DELETE`.
- **Tests:** `test_suscribir_ok`, `test_suscribir_falla` (endpoint sin `https://` → 400).

#### #53 · B43 · `feat(back)`: avisa a quien espera cuando el desfile se acerca

- **Para entender:** cada vez que llega una posición de la cabeza se revisa a quién le
  falta poco, se le manda la notificación con web push y su suscripción se borra (un aviso
  por pedido). Para saber cuánto falta hace falta la velocidad del desfile, así que se
  porta `estimarVelocidad` de `src/lib/eta.ts`. Un fallo mandando avisos no puede tumbar la
  ingesta.
- **Depende de:** B42, B28
- **Qué:** `app/dominio/eta.py` con `estimar_velocidad` (port exacto, mismas constantes),
  `app/push.py` con `avisar_cercanos(estado)` (como mucho una revisión cada 15 s por
  desfile, `pywebpush`, en segundo plano con `BackgroundTasks`), llamado desde
  `POST /api/posiciones` cuando entra la cabeza.
- **Tests:** `test_estimar_velocidad_ok`, `test_estimar_velocidad_falla` (menos de 90 s de
  historial → velocidad nominal) y **específico**: `test_desfile_detenido_no_avisa`.

---

### Fase 6 — Secretos y despliegue

#### #31 · B44 · `chore(back)`: maneja los secretos con sops y age

- **Para entender:** `age` genera un par de llaves (pública y privada). `sops` cifra un YAML
  con la pública: los nombres de las variables quedan legibles y los valores cifrados. Ese
  archivo sí se sube al repo; solo quien tiene la llave privada (tú, el CI) puede leerlo.
- **Depende de:** B04, B06
- **Requiere al mantenedor:** generar la llave (`age-keygen`), ponerla en `.sops.yaml` y
  cifrar. El agente deja `age1REEMPLAZAR` y los pasos exactos en el PR.
- **Qué:** `.sops.yaml` con reglas para `secrets/dev.enc.yaml` y `secrets/prod.enc.yaml`;
  `secrets/README.md` (editar con `sops secrets/dev.enc.yaml`, correr con
  `sops exec-env secrets/dev.enc.yaml 'cd backend && uv run fastapi dev'`), con la lista de
  variables de B06.
- **Aceptación:** con la llave del mantenedor `sops -d` funciona y el hook de B04 rechaza un
  archivo sin cifrar.

#### #32 · B45 · `chore(back)`: empaqueta el backend en un Dockerfile

- **Para entender:** una imagen Docker es el backend con todo lo que necesita para correr,
  empaquetado. Railway descarga esa imagen y la ejecuta. «Multi-stage» significa que se
  instala todo en una etapa y a la imagen final solo pasa lo necesario, así pesa menos.
- **Depende de:** B43
- **Qué:** `backend/Dockerfile` multi-stage con la imagen oficial de uv (`uv sync --frozen
  --no-dev`), copia `app/`, `migraciones/`, `seed/`, `alembic.ini`; usuario no root;
  `CMD fastapi run --host 0.0.0.0 --port ${PORT}`. `.dockerignore`.
- **Aceptación:** `docker build backend/` funciona y el contenedor responde `/api/salud`.

#### #33 · B46 · `chore(infra)`: inicia Terraform con el provider de Railway

- **Para entender:** Terraform describe la infraestructura en archivos (`.tf`): «quiero un
  proyecto en Railway con este servicio y estas variables». `terraform plan` muestra qué
  cambiaría y `apply` lo hace. El **estado** es un archivo donde Terraform recuerda qué
  creó; tiene que vivir en un lugar compartido para que tu máquina y el CI vean lo mismo.
- **Depende de:** B45
- **Requiere al mantenedor:** **decidir dónde vive el estado** (recomendado: HCP Terraform,
  plan gratis; alternativa: bucket S3/R2). El agente deja la opción recomendada marcada.
- **Qué:** `infra/` con `versions.tf` (`terraform-community-providers/railway`,
  `carlpett/sops`, versiones fijadas), `providers.tf`, `main.tf` con `railway_project` y el
  entorno `production`, `.terraform.lock.hcl`. `tflint` en pre-commit.
- **Aceptación:** `terraform init && terraform validate` pasan.

#### #34 · B47 · `chore(infra)`: crea Postgres en Railway

- **Para entender:** la base de producción también es un servicio en Railway, con un
  volumen (disco) para que los datos sobrevivan a reinicios.
- **Depende de:** B46
- **Qué:** **primero investiga** si el provider permite crear Postgres con volumen
  persistente (servicio con imagen `ghcr.io/railwayapp-templates/postgres-ssl` + volumen).
  - Si se puede: en Terraform, con `DATABASE_URL` como output sensible.
  - Si no: documenta en `infra/README.md` cómo crearlo desde el panel y toma su
    `DATABASE_URL` como variable de entrada. No inventes recursos que el provider no tenga.
- **Aceptación:** `terraform plan` sin errores; la decisión queda escrita en el PR.

#### #54 · B48 · `chore(infra)`: crea el bucket de fotos

- **Para entender:** el almacenamiento S3 de B39 necesita un bucket real en producción, con
  su URL y sus llaves de acceso, que llegan al backend como variables.
- **Depende de:** B47
- **Requiere al mantenedor:** si no se puede en Railway, crear el bucket en Cloudflare R2 y
  guardar las llaves en `secrets/prod.enc.yaml`.
- **Qué:** **primero investiga** si Railway ofrece buckets S3 y si el provider los soporta.
  Si sí, en Terraform con sus credenciales como outputs sensibles; si no, documenta R2 en
  `infra/README.md` y toma las cuatro variables `S3_*` de sops. El bucket es **privado**.
- **Aceptación:** `terraform plan` sin errores; la decisión queda escrita en el PR.

#### #35 · B49 · `chore(infra)`: despliega el servicio de la API con secretos de sops

- **Para entender:** aquí se juntan las piezas: Terraform le dice a Railway qué imagen
  correr, lee los secretos de `prod.enc.yaml` con sops y se los pasa al servicio como
  variables de entorno, las mismas que lee `config.py`.
- **Depende de:** B44, B48
- **Qué:** `railway_service` con `source_image = "ghcr.io/<org>/sigue-el-desfile-backend:${var.imagen_tag}"`,
  una réplica, pre-deploy `alembic upgrade head`, healthcheck en `/api/salud`, dominio de
  Railway. Variables de B06 desde `data "sops_file"` y las de Postgres y el bucket.
- **Aceptación:** `terraform plan -var imagen_tag=<sha>` muestra el servicio con variables
  sensibles.

#### #36 · B50 · `chore(ci)`: publica la imagen y aplica Terraform al mergear

- **Para entender:** es el CD (despliegue continuo): al mergear a `trunk`, GitHub construye
  la imagen, la sube a GHCR (el registro de imágenes de GitHub) y corre `terraform apply`
  para que Railway use la nueva. El environment `production` con aprobación manual hace
  que nada salga sin que lo autorices.
- **Depende de:** B05, B49
- **Requiere al mantenedor:** crear los secretos `SOPS_AGE_KEY` y `RAILWAY_TOKEN` y el
  environment `production` con aprobación manual.
- **Qué:** `.github/workflows/backend-cd.yml`:
  - PR que toca `infra/**`: `terraform fmt -check`, `validate` y `plan` comentado en el PR.
  - Push a `trunk` que toca `backend/**` o `infra/**`: build y push a GHCR (tag = SHA) y
    `terraform apply -var imagen_tag=$SHA` en `production`.
- **Aceptación:** un merge despliega y `/api/salud` responde en el dominio de Railway.

---

### Fase 7 — Conectar la web y documentar

#### #37 · B51 · `feat(datos)`: lleva las lecturas públicas de la web al backend

- **Para entender:** la web ya sabe hablar con dos fuentes de datos (`local` y `supabase`).
  Se agrega `api`: las pantallas públicas piden todo a `NEXT_PUBLIC_API_URL` en vez de a
  `/api` del propio Next. Como el contrato es el mismo, cambia la URL, no las pantallas.
- **Depende de:** B50
- **Qué:** `NEXT_PUBLIC_DATOS=api` + `NEXT_PUBLIC_API_URL`. Los hooks y pantallas públicas
  (estado y stream, densidad, dispositivo, programación, comercios y su evento, fotos,
  recorrido, avisos push) usan una función `urlApi(ruta)` que respeta el modo. El service
  worker cachea también las respuestas del backend. `local` y `supabase` no se tocan.
- **Aceptación:** con el backend local, `npm run dev` en modo `api` muestra el desfile, la
  programación y los comercios del backend.
- **Tests:** `npm run typecheck` y `npm test` pasan; una prueba de `urlApi` (ok y sin
  `NEXT_PUBLIC_API_URL`).

#### #55 · B52 · `feat(ui)`: inicia sesión con correo y contraseña en los paneles

- **Para entender:** los paneles de admin y de reportero hoy entran con una contraseña única
  y con un código. En modo `api` pasan a un solo login con correo y contraseña; el token se
  guarda en el navegador y se manda como `Bearer`. Cada panel muestra solo lo que los
  permisos del usuario dejan hacer.
- **Depende de:** B51
- **Qué:** pantalla de login común, cliente de API con el token, paneles que leen
  `permisos` de `/api/auth/yo`; la gestión de reporteros pasa a gestión de usuarios con
  roles y puesto. La cola de envíos del reportero (`useReporte`) manda el token.
- **Aceptación:** un admin crea un reportero desde el panel, el reportero entra y sus
  posiciones mueven el desfile.
- **Tests:** `npm run typecheck` y `npm test` pasan.
- **Fuera de alcance:** quitar los modos `local` y `supabase`.

#### #56 · B53 · `feat(simulacion)`: hace que el simulador entre con un usuario de ingesta

- **Para entender:** el simulador manda posiciones de los tres puestos, así que entra con
  una cuenta de servicio con el rol `ingesta` en vez de con `INGESTA_TOKEN`.
- **Depende de:** B51
- **Qué:** `scripts/simular-desfile.ts` acepta `--email` y `--password` (o variables de
  entorno), hace login y manda `Authorization: Bearer`. `python -m app.cli sembrar --dev`
  crea un usuario `simulador@local` con rol `ingesta` (solo con `ENTORNO=dev`).
- **Aceptación:** `npm run simular -- --url=http://localhost:8000 --email=... --password=...`
  mueve el desfile.

#### #38 · B54 · `docs(back)`: documenta cómo correr, probar y desplegar el backend

- **Para entender:** cierra el ciclo: que alguien nuevo pueda levantar todo leyendo un solo
  archivo.
- **Depende de:** B52, B53
- **Qué:** `backend/README.md` (Nix, base local, sops, tests, crear admin, sembrar,
  desplegar). En el `README.md` raíz, actualizar «Los dos adaptadores de datos» y «Subirlo
  a producción». En `CLAUDE.md`, pasar los comandos del backend de «cuando exista» a reales.

---

## 3. Orden y dependencias

El camino principal es lineal a propósito, para revisar y entender un paso a la vez:

```
Fase 0-1  B01 → B02 → B03 → B04 → B05 → B06 → B44 → B07 → B08
Fase 2    B09 → B10 → B11 → B12 → B13 → B14 → B15 → B16 → B17
Fase 3    B18 → B19 → B20 → B21 → B22 → B23
Fase 4    B24 → B25 → B26 → B27 → B28 → B29 → B30 → B31 → B32 → B33 → B34
Fase 5    B35 → B36 → B37 → B38 → B39 → B40 → B41 → B42 → B43
Fase 6    B45 → B46 → B47 → B48 → B49 → B50
Fase 7    B51 → B52 → B53 → B54
```

Las dependencias reales (`Depende de`) son más laxas: si hace falta ir en paralelo, B04/B05
pueden ir junto a B06–B08, la fase 3 junto a la de usuarios a partir de B09, y B36–B38 o
B39–B41 son independientes entre sí.

## 4. Fuera de este plan

Para no perderlos, pero **no** se hacen ahora: recuperar contraseña por correo, refresh
tokens, frenos compartidos entre réplicas, staging, observabilidad, tests de integración
contra Postgres, anunciantes y promociones, quitar los adaptadores `local` y `supabase`, la
app móvil.
