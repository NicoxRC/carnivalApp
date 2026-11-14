# Backend glossary

The web app (`src/`) is written in Spanish; the backend is written in English. This is the
agreed translation of the domain terms, so the same thing always gets the same name in
code, tables, routes and JSON.

## Language rules

- **English:** code, comments, tests, tables and columns, environment variables, HTTP
  routes, JSON keys, enum-like values (roles, permissions, posts, states), docs, commits,
  PRs and issues.
- **Spanish:** only human-readable text inside values, such as the message in
  `{"error": "No existe."}`.
- When porting something from `src/`, the TypeScript code is still the specification for
  behaviour. Its names are translated with this table.

## Domain terms

| Spanish (web) | English (backend) | Notes |
|---|---|---|
| desfile | parade | |
| senda | course | Not `route`: that word is taken by HTTP routes |
| hito | waypoint | A named point along the course |
| posición | position | |
| metros en senda | course metres (`course_m`) | Distance from the start of the course |
| estado | state | The live state of a parade |
| recorrido | progress | Where the parade is, waypoint by waypoint |
| programación | schedule | |
| evento | event | |
| gentío | crowd | |
| densidad | density | |
| aviso (del equipo) | announcement | A message from the team to everyone |
| aviso push | push subscription | |
| comercio | business | |
| promo | offer | What a business with a plan advertises |
| horario | hours | Opening hours, free text |
| enlace | link | |
| foto | photo | |
| dispositivo | device | |
| usuario | user | |
| rol | role | Access role, see below |
| permiso | permission | |
| puesto | post | Where a reporter walks: head, middle or tail |
| freno | rate limit | |
| relevo | handover | When a second reporter takes over a post |
| tramo | stretch | A 100 m piece of the course (`bin` in the density JSON) |
| ingesta | ingest | Service accounts that send positions |

## Values

| Kind | Spanish (web) | English (backend) |
|---|---|---|
| Reporter post | `cabeza`, `mitad`, `cola` | `head`, `middle`, `tail` |
| Roles | `admin`, `coordinador`, `editor`, `moderador`, `reportero`, `ingesta` | `admin`, `coordinator`, `editor`, `moderator`, `reporter`, `ingest` |

| Waypoint kind | `iglesia`, `comercial`, `colegio`, `universidad`, `plaza`, `parque`, `estadio`, `hospital` | `church`, `mall`, `school`, `university`, `square`, `park`, `stadium`, `hospital` |
| Crowd level | `tranquilo`, `con_gente`, `lleno` | `calm`, `busy`, `full` |
| Announcement level | `info`, `alerta` | `info`, `alert` |
| Event category | `presentacion`, `tasca`, `cultural`, `infantil` | `stage`, `tasca`, `cultural`, `kids` (`tasca` has no translation: it is a Carnival food stall) |
| Business category | `restaurante`, `tasca`, `cafe`, `heladeria`, `panaderia`, `tienda`, `bar`, `farmacia` | `restaurant`, `tasca`, `cafe`, `ice_cream`, `bakery`, `shop`, `bar`, `pharmacy` |
| Service category | `bano`, `hidratacion`, `salud`, `policia`, `cierre` | `toilet`, `water`, `first_aid`, `police`, `road_closure` |
| Business plan | `basico`, `destacado` | `basic`, `featured` |
| Offer timing (`promoMomento` → `offerTiming`) | `siempre`, `antes`, `despues` | `always`, `before`, `after` |
| Metric type | `ficha`, `mapa`, `menu`, `whatsapp`, `enlace`, `oferta` | `card`, `map`, `menu`, `whatsapp`, `link`, `offer` |
| Parade state | `programado`, `en_curso`, `finalizado` | `scheduled`, `in_progress`, `finished` |
| Parade action | `iniciar`, `finalizar`, `reiniciar` | `start`, `finish`, `restart` |
| Photo state | `pendiente`, `aprobada`, `rechazada` | `pending`, `approved`, `rejected` |

Permissions are new to the backend and are listed in `docs/backend/PLAN.md` §1.3. Other
value sets (event and business categories, plans) are translated in the issue that
introduces them and added here in the same PR.

## Code names already in place

| Before | Now |
|---|---|
| `app/errores.py`, `registrar_errores` | `app/errors.py`, `register_error_handlers` |
| `app/modelos.py` | `app/models.py` |
| `app/rutas/salud.py`, `GET /api/salud` | `app/routers/health.py`, `GET /api/health` |
| `get_sesion`, `SesionDep` | `get_session`, `SessionDep` |
| `backend/migraciones/` | `backend/migrations/` |
| `scripts/db-local.sh` (`parar`) | `scripts/local-db.sh` (`stop`) |
| `scripts/verificar-sops.sh`, hook `sops-cifrado` | `scripts/check-sops.sh`, hook `sops-encrypted` |
| `JWT_SECRETO`, `JWT_HORAS` | `JWT_SECRET`, `JWT_HOURS` |
| `CORS_ORIGENES`, `ENTORNO` | `CORS_ORIGINS`, `ENVIRONMENT` |
| `VAPID_PUBLICA`, `VAPID_PRIVADA`, `VAPID_CONTACTO` | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_CONTACT` |
| `S3_LLAVE`, `S3_SECRETO` | `S3_ACCESS_KEY`, `S3_SECRET_KEY` |
