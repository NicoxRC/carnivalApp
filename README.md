# Sigue el Desfile

Web app (PWA) to follow live the parades of the Carnaval de Negros y Blancos in Pasto,
Colombia.

**Status: the web is being connected to the backend.** The backend (FastAPI +
PostgreSQL, in `apps/backend/`) has every module working and tested. The web's embedded
backend and its in-memory mode were removed in #88, so until the «Connect the web to the backend» milestone on GitHub is done the
web's screens open **without data**. What is missing
before going public is in "What is missing before this is really useful".
 The web app is written in Spanish
(file names, identifiers and interface texts); the backend and all the docs are in English.

---

## Getting started

```bash
cd apps/web
npm install
npm run dev
```

Open <http://localhost:3000>. The map follows the current parade live from the backend at
`NEXT_PUBLIC_API_URL` (in development, `http://localhost:8000` if it is not set): run it
with `just dev` and load the sample data with `just seed` (see `CLAUDE.md`). The schedule,
businesses, crowd map, photos and panels come back part by part in the «Connect the web to
the backend» milestone.

The parade moves with positions sent to the backend: from the reporters' panel or with the
simulator. In another terminal, from `apps/web/`:

```bash
npm run simular -- --velocidad=1.5
```

It logs in as `simulator@local`, the `ingest` user `just seed` creates in development, and
sends head, middle and tail of the current parade to `POST /api/positions`, the same door
as a reporter's phone: **there is no "pretend" path parallel to the real one**. Options:
`--velocidad` (km/h, 1.5), `--intervalo` (seconds, 12), `--separacion` (metres between
posts, 550), `--paradas=false` (never stops), `--inicio` (starting metres), `--url`
(`http://localhost:8000`). Against another server it needs a real `ingest` account:
`--email=… --password=…` (or `SIMULADOR_EMAIL` / `SIMULADOR_PASSWORD`).

---

```bash
cd apps/web
npm run typecheck    # types
npm test             # tests of the ETA, the course and dates
npm run build
```

Run them before opening a PR: the web has no CI yet (the backend's is in
`.github/workflows/backend-ci.yml`).

---

## The idea that holds everything up: the course is 1D

The course is a known fixed route. Any point (the head, the tail, the user) is projected
onto that line and reduced to **a single number: metres from the start**
(`apps/web/src/lib/course.ts`). The ETA is arithmetic on that number (`apps/web/src/lib/eta.ts`).

Nothing in the app reasons in two dimensions. If something starts needing to, it is almost
certainly badly framed.

---

## Where the data comes from

From the backend in `apps/backend/`, and only from there. The web keeps the client logic
(projection onto the course, ETA, dates in Pasto time, texts) and the screens; everything
that is stored, validated or computed for everyone (the current parade, positions, crowd
map, photos, push, users) lives in the backend. The connection is built in
the «Connect the web to the backend» milestone on GitHub. The backend's decisions are in `docs/backend/ARCHITECTURE.md`.

---

## Changing the course

⚠️ **The route that ships is NOT the official course.** It is an approximate polyline over
Pasto, drawn by hand to be able to develop. The streets the waypoints name are indicative,
not verified. The app warns about it on screen while that is so.

To replace it, edit `apps/web/src/data/carnival-course.ts`:

- `geojson.geometry.coordinates`: the official route as `[lng, lat]` (in that order!),
  from the starting point to the finish.
- `hitos`: reference names, each pointing to an index of the coordinates array.
- `oficial: true` when it really is: that turns off the yellow warning.

The length and the metres of each waypoint are computed on load. It is TypeScript and not
JSON because the `npm run simular` script runs outside the bundler.

---

## What is missing before this is really useful

Ordered by what hurts most if ignored.

**1. Connect the web to the backend and deploy with HTTPS.** The backend is not deployed
yet (issues #33 and #36) and the web does not read from it yet. And
without HTTPS the reporters' panel cannot be tested on a phone: the browser does not
hand over GPS or keep the screen on over `http://` (except on `localhost`).

**2. Test the reporters' panel while walking.** On iPhone and on Android, with the screen
on for four hours, an external battery and bad signal. On the web GPS stops when the screen
locks: if Wake Lock fails on some phone of the team, that has to be known before the 31st,
not that day.

**3. Test it with a bad network.** It is designed for that (a service worker that keeps the
shell, the map and the schedule; reconnection with backoff and jitter; always the last
value with its time) and it was tested by switching the server off, but **not with real 3G
throttling**.

**4. Push notifications on iPhone.** They only work with the app installed on the home
screen (iOS 16.4+). Without that there is the local notification, which only sounds with
the app open. It has to be tested on a real iPhone, and a decision made on whether to ask
people to install it.

**5. The privacy policy.** `/privacy` describes exactly what the code does, but it is a
**draft**: the data controller, a real contact and a lawyer's review against Colombia's Ley
1581 de 2012 are missing.

**6. The pilot at another event.** An open-streets day, a procession, anything with a
route. If December 31 fails, there is no second chance until the following year.

**7. Corpocarnaval.** Without its endorsement there is no official course, no real
schedule, no services (toilets, water) to load, and no legitimacy to sell advertising on
UNESCO heritage.

**Known limitations still open:**

- **The crowd map can still be faked with many IPs.** Device ids are signed by the server
  and issuing them is capped per IP, so a loop is no longer enough; but it is not
  tamper-proof. And it still measures users of the app, not people.
- **The CSP allows inline scripts** (`'unsafe-inline'`): removing it requires per-request
  nonces. And there is a high-severity vulnerability in the `postcss` bundled with Next 15;
  it goes away by moving to Next 16.
- **There is no lint and no error monitoring.** The backend's `/api/health` is there for an
  external monitor, but nothing alerts on its own if something goes down.
- **The 1D projection assumes the course does not pass twice through the same place.** If
  the official route has nearly parallel stretches, a point can snap to the wrong one; the
  projection would have to be bounded to the surroundings of the last position.

---

## Decisions that were settled in the code

Things the spec did not close and that were resolved in a concrete way. If any is not
convincing, here is the why:

- **The ETA is shown in 5-minute ranges**, asymmetric (−25 % / +40 %): a parade falls
  behind far more easily than it gets ahead.
- **With less than 90 seconds of history the measured speed is not used**, but a nominal
  one of 1.2 km/h, and the UI says so ("a ritmo estimado"). With 30 seconds of data GPS
  noise dominates the signal and the measured number measures nothing.
- **6 km/h ceiling.** Above that it is a GPS jump, not a fast parade: the measurement is
  discarded instead of showing an absurd ETA.
- **Two stop thresholds, not one.** The spec asked to warn after 10 minutes stopped; that
  leaves the user without a useful signal for nine. After 3 minutes a soft notice appears
  ("sin avanzar hace 4 min") and after 10 the headline turns red.
- **The course goes in the bundle**, it is not fetched over the network. It is ~2 KB and
  that way the map draws without depending on the cell tower. The backend's `/api/course`
  is there for tools.
- **The app follows ONE parade: the "current" one.** The one in progress; if there is
  none, today's; otherwise the next one (the backend decides it). The user is not asked
  which one to watch, and reporters always write to that one. Asking for a parade that
  does not exist gives 404: one is never created by naming it.
- **With the head silent for more than 5 min no time is given.** The headline becomes
  «sin noticias del desfile hace 8 min». A «llega en 20–35 min» computed on where the
  parade WAS is old data dressed up as new.
- **A value served from the cache does not count as a new value.** Without a network, the
  service worker returns the last copy; the app shows it, but does not mark it "live" or
  reset its age, and never lets it overwrite something more recent.
- **One role, one sender.** If two reporters have the same role, the one already sending
  wins; the other stays as backup and takes the role only if the holder goes silent for a
  minute. Two phones blocks apart made the head jump.
- **A GPS fix worse than ±150 m is discarded** on the server (and worse than ±100 m is
  not even sent).
- **"Today" is Pasto's date**, not the phone's and not UTC (`apps/web/src/lib/dates.ts`).
- **The brake on guessing passwords is a wait, not a block.** Each failure makes the next
  answer take longer (up to 5 s). With a block, six attempts by anyone locked the
  administrator out.

---

## The base map

The tiles are our own: `apps/web/public/mapa/pasto.pmtiles` (≈2.4 MB, all of Pasto up to z15,
derived from OpenStreetMap by Protomaps) and the label fonts in `apps/web/public/mapa/fuentes/`.
There is no dependency on `tile.openstreetmap.org`, whose usage policy does not allow a
mass-market app.

- **It opens without a network.** The service worker stores the whole file on the first
  visit and cuts from the cache the pieces the viewer asks for. Tested: with the network
  cut the map draws completely.
- **The style** (paper colours, without the base map's points of interest) is generated
  with `npm run mapa:estilo` and versioned in `apps/web/src/data/map-style.json`, so the style
  library is not sent to the phone.
- **MapLibre's worker** is copied from `node_modules` to `apps/web/public/mapa/` before every `dev`
  and `build` (`npm run mapa:worker`): since version 6 it is not embedded.
- **Updating the tiles** (once a year is enough):

  ```bash
  go install github.com/protomaps/go-pmtiles@latest
  pmtiles extract https://build.protomaps.com/YYYYMMDD.pmtiles apps/web/public/mapa/pasto.pmtiles \
    --bbox=-77.33,1.16,-77.23,1.26 --maxzoom=15
  ```

  And bump `VERSION` in `apps/web/public/sw.js`, or phones keep the old file.
  `NEXT_PUBLIC_MAPA_PMTILES` lets you point to another path **on the same domain**. If the
  file is served from another domain (R2, S3), the map works with a network but the
  service worker does not store it: the map is lost without signal.

## Who can write

Reading the parade is public. Writing is not: a fake head lies to the whole course at once.
Everything that writes goes through the backend, with users, roles and permissions
(`apps/backend/app/permissions.py`):

| Role | What they can do |
|---|---|
| `admin` | Everything, including managing users |
| `coordinator` | The parade's state and positions of any role |
| `editor` | Parades, schedule, businesses and announcements |
| `moderator` | Photo moderation |
| `reporter` | Send positions of the current parade, always with their own post |
| `ingest` | Send positions of any post (the simulator and tools) |

- Login with email and password returns a token (JWT); there is no sessions table.
- The public has no account. For the crowd map and photos a device id issued and signed by
  the server is used (`POST /api/device`), with a cap on issuing per IP.
- The web's panels still log in the old way (a password and reporter codes) and have no
  backend behind them until issue #55 moves them to these users.

## Reporters' panel

`/reporter`. A dark, minimal screen, designed for four hours in the hand in full sun.

1. The reporter logs in (once a day) and taps **Empezar a reportar**.
2. From there **GPS goes out on its own every 20 s**. Nothing has to be touched.
3. **«Estoy aquí»** sends instantly. For when the parade stops or starts again.
4. If GPS is no good, they mark **by reference point** (the list of waypoints).

What it withstands: if the network drops, points are stored on the phone and go out
together when signal returns; the time is corrected with the server clock; and it asks to
keep the screen on (Wake Lock), because **with the screen locked the browser stops reading
GPS**. If the browser does not allow it, the panel says so. The screen also confirms to the
reporter where the app thinks they are («estás por Colegio Champagnat»): if it says
something odd, they notice at once.

**Substitutes.** A substitute per role is advisable, with their own code and the panel
open. They do not get in the way: while the holder sends, the substitute sees «de
respaldo» and their points do not go in; if the holder goes silent for a minute, the
substitute takes the role on their own.

**It needs HTTPS.** Over `http://` (outside `localhost`) the browser does not hand over
GPS; the panel warns about it.

## Admin panel

`/admin`. Five tabs (until issue #55 it has no backend behind it):

- **En vivo**: the current parade on a map, where each role is, how long ago it sent and
  who reports it. Buttons to mark it in progress, finish it or restart it.
  - **Corregir**: place a role on the map by hand when a reporter sent something absurd or
    lost signal.
  - **Alertas**: if a role has been silent for more than 5 min with the parade in
    progress, a red notice shows, a beep sounds and (if enabled) a notification arrives.
    Only with the panel open in some browser.
  - **Mensaje para todos**: a text that shows above everyone's map instantly («arranca
    con 40 min de retraso»). It expires on its own.
- **Programación**: each day's parades and the other events. It is what feeds «Hoy»,
  «Desfiles» and the Tarimas layer.
- **Reporteros**: create (generates the code), change role, deactivate, regenerate code,
  delete.
- **Comercios**: creating and editing with the location on the map, plan, offer, menu,
  WhatsApp and link; and the services (toilets, water…). Each business shows **its
  numbers**: how many saw the offer, opened the card, saw the menu or tapped WhatsApp.
- **Fotos**: the moderation queue. Nothing reaches the wall without going through here.

## Finding your way by landmarks, not by streets

People do not locate themselves by "carrera 27 con calle 18": they do it by the church, the
shopping centre, the school. That is why the course's waypoints are **recognisable
places**, not street crossings, and the app speaks in those terms:

- On the map, each waypoint has its icon and its name. Below a certain zoom the names are
  hidden so they do not overlap.
- The ETA says "va por Iglesia de Cristo Rey" or "va entre Champagnat y Cristo Rey".
- The user gets confirmation of where the app thinks they are ("estás por Unicentro"),
  which is the only way they can notice if the point is wrong.

Waypoints are edited in `apps/web/src/data/carnival-course.ts`: name, short name, type and
coordinate. Each one is projected onto the course on its own.

⚠️ **The waypoints that ship are a template.** The names are of places that exist in
Pasto, but the coordinates were placed by eye on a route that is not the real one either.
They have to be corrected with local knowledge before being used.

## Desktop and mobile

One codebase, two shapes. The cut is at `lg` (1024 px).

| | Mobile | Desktop |
|---|---|---|
| Navigation | tab bar at the bottom, inside the safe area | 92 px side rail, full height |
| ETA bar / card | full-width sheet, stuck to the bottom | 420 px card floating bottom left |
| Map controls | bottom left | bottom right, so they do not collide with the card |
| Hoy · Desfiles | one column | two columns; the live card spans both |
| Fotos | two columns | four columns |

The reasoning: at 1,500 px wide, a 26 px headline centred across the whole screen reads
**worse**, not better, and a four-tab bar spread over a metre and a half is used by nobody.
That is why on desktop the information is grouped to one side and the map keeps all the
space, which is the only thing that really gains from a big screen.

`maximum-scale=1` was also removed from the viewport: blocking zoom shuts out whoever
needs to enlarge the text, and MapLibre already captures its own gestures inside the map.

## Going to production

Steps, in order:

**1. Deploy the backend** on Railway with Terraform, with continuous deployment on merge
(issues #33 and #36).

**2. Point the web at the backend** (`NEXT_PUBLIC_API_URL`) and move the panels' login to
the backend's users (issues #37 and #55).

**3. Vercel (the maintainer's account).** Import the repo into Vercel with **Root
Directory `apps/web`** and set the web's environment variables. The web no longer has
server secrets: they all live in the backend.

### What you need to know before showing it to someone

- **To move the parade on a deployment** the simulator is run against the backend with a
  real `ingest` account: `npm run simular -- --url=https://… --email=… --password=…`.
- **It is still untested with a bad network**, which is the project's number one risk.
- The course, the waypoints, the businesses and the schedule are still **sample data**.

## Businesses on the map

The **Comercios** layer brings together restaurants, *tascas*, cafés, shops and
pharmacies. Each one is a tappable marker: tapping it opens its card at the bottom, in
place of the ETA bar, with what it is, where it is, how far it is from you, when it opens
and (if it signed up) its offer, its menu and its WhatsApp.

It all goes together in a single filter on purpose: for someone standing on the course,
"where do I eat, where do I buy" is the same question. The icon tells what kind each place
is; the colour does not change by category because with eight colours the map becomes
unreadable exactly where there is the most.

The **Servicios** layer (toilets, water, first aid, police, closures) uses the same store
and form, but only appears if the team loaded any. ⚠️ Only with official data: an invented
toilet on a map someone uses to find a toilet is worse than not offering the layer.

### What is sold

| | No plan | Básico | Destacado |
|---|---|---|---|
| Appears on the map with its card | yes | yes | yes |
| Offer, menu, WhatsApp and link on the card | — | yes | yes |
| «Oferta cerca» to whoever passes within 300 m | — | — | yes |
| Showcase on the Hoy screen (rotates every 30 min) | — | — | yes |

- **Appearing on the map does not depend on paying.** The directory is valuable for being
  complete, not for being paid.
- **The offer can be by moment**: all day, only before the parade passes the business, or
  only after («2x1 en hervidos cuando pase el desfile»).
- **What is paid carries the «PAUTA» label**, discreet, next to the button. Discreet
  because it is not the first thing that matters; present because if the user cannot tell
  what is advertising and what is not, the trust being sold to the advertiser stops
  existing. In Colombia unidentified advertising is a problem with the SIC, not just one of
  style.
- **The report for the advertiser** is in `/admin` → Comercios: counters of views and
  taps. They identify nobody and do not tell whether the same person opened the card
  twice; anyone could inflate them with a script, so they are good for showing interest,
  not for billing per click.

Businesses are managed from `/admin`. The sample ones live in `apps/backend/seed/businesses.json`
(edited by hand, loaded with `just seed`). ⚠️ The ten in the JSON are **made up**: no real business has signed up
for anything.

## Notifications, sharing and photos

- **«Avisame cuando esté cerca».** In the ETA bar. With VAPID keys on the backend
  (`npm run push:llaves`) the notification arrives even with the app closed: every time a
  position of the head comes in, it is checked who has 10 min or less left, they are
  notified and their subscription is deleted. Without keys, or if the browser does not
  support push, the app itself watches the ETA and notifies, but only while it is open,
  and it says so.
- **«Compartir mi punto».** It builds a link `/?encuentro=<metres>` with the text «estoy
  por Cristo Rey, llega en 20–35 min». Whoever opens it sees a pin at that point of the
  course. Only the course metre travels, not the exact position.
- **Termina de pasar en…** With the tail reporting, the ETA also says how long until the
  parade finishes passing where the user is.
- **Photos.** Anyone uploads; the photo is reduced on the phone (which also wipes its
  metadata, coordinates included), stays **pending** and only reaches the wall when
  someone on the team approves it. Maximum 8 per device per hour.
- **Where it went.** In «Desfiles», each parade that has already gone out shows at what
  time the head passed each reference point.
- **English.** The interface is in Spanish and English (`apps/web/src/lib/i18n-texts.ts`); it is
  chosen automatically from the phone's language and can be changed. Content loaded by the
  team is not translated.

## Crowd map

The "Gentío" layer paints the route from green to red according to how many people are in
each 100 m stretch. It helps decide where to stand.

**How it is measured.** Each phone sends once a minute **the number of the stretch** it is
in: never lat/lng, never a history. In the backend's database there is one row per device
that is overwritten; the id only serves not to count the same person twice.

**Two safeguards, and why they exist:**

1. **Global threshold.** Below 50 active users the layer paints nothing and says there is
   not enough of a sample. Without this, on December 31 at 9 in the morning the map would
   say "empty" on a block with five thousand people, which is the worst possible way to be
   wrong.
2. **A stretch without samples is not an empty stretch.** Stretches with fewer than 3
   reports are left without data instead of being painted green.

**Consent is explicit.** On turning the layer on for the first time the user is asked
whether they want to contribute their position, with the option of "solo mirar". Looking
does not oblige sharing.

**«¿Dónde me hago?».** With the layer on and enough of a sample, it suggests up to three
stretches with room further ahead of the parade, with how long until it reaches each. It
only recommends stretches KNOWN to be calm; one without data is not suggested.

**What this feature CANNOT do, and is worth keeping in mind:**

- **It measures users of the app, not people.** If there are 3,000 people on a block and
  none has the app, it shows no data. The correlation improves with adoption, and in the
  first year adoption is an unknown.
- **It only measures on the course.** The model is 1D: it knows nothing about side streets
  or squares off the route.
- **Saying "there is room here" carries a risk that saying "it is full there" does not.**
  Sending people to a spot can fill it, or leave them somewhere with no view. If the data
  turns out weak in the pilot, the prudent thing is to keep only the red stretches.

## The applied design

The interface comes from `design/Sigue el Desfile.dc.html`. What changed: the theme (from
dark to high-contrast light paper), the typography (Alfa Slab One for headlines), the voice
(Pasto Spanish with *voseo*) and the navigation (from 2 tabs to 4).

Decisions that had to be made because the design did not cover them or they could not be
built as they were:

- **Water and Toilets were left out of the map layers.** The design proposed Desfile ·
  Agua · Baños · Tarima, but there is no data source for water or toilets. An invented
  toilet on a map someone is going to use to find a toilet is worse than not offering the
  filter. In their place go **Desfile · Tarimas · Tascas**, which do come from real data.
  They come back as soon as Corpocarnaval publishes those points.
- **In Fotos no @users or "like" counters are painted.** The design had them, but
  inventing people's names and like counts in an app with the Carnival's name is
  fabricating fake social proof. The wall only shows photos the team approved.
- **The design only solved the ETA's happy state.** The other six (stopped, already
  passed, passing you now, no location, far from the course, no reports) are written in
  the same register. Two colours the design did not have were needed: an alert red and a
  dark amber readable on white.
- **The head, the middle and the tail are all three still on the map.** The artboard only
  drew the head, but knowing where each one is is the product's number one promise.
- **Points of interest are told apart by shape, not by colour.** The design uses purple
  for Tarima, which is the same purple as the tail. Points of interest are rounded squares
  and the parade is circles.
- **Only the `latin` subset of the font is served** (19 KB). The export also had
  latin-ext and Vietnamese: 27 KB nobody was going to use on December 31.
- **Typos in the design fixed:** «segueí» → «seguí», and «toda la programa» → «toda la
  programación».
- **Copy adjusted to what exists:** the home said «con baños, agua y tarima»; now it says
  «con tarimas y tascas», which is what the app actually shows.

## Structure

```
apps/
  web/                    the Next.js PWA
    src/
      app/
        page.tsx              live map
        today/ parades/ photos/ the other three tabs
        privacy/              which data the app uses (draft)
        reporter/ admin/      the team's panels
        error.tsx not-found.tsx robots.ts manifest.ts
      components/
        ParadeMap.tsx         MapLibre: course in 3 stretches, markers, points of interest
        EtaBar.tsx            the white sheet: the ETA states, notification and sharing
        *Screen.tsx           one per tab
        ReporterPanel.tsx     the reporters' panel
        admin/                the admin panel, one tab per file
      lib/
        course.ts             1D projection (Turf)
        eta.ts                speed, ranges, stops, no signal
        dates.ts              dates in Pasto time
        i18n-texts.ts         Spanish and English
        hooks/                live state, schedule, businesses, crowd map, GPS
        *.test.ts             tests (npm test)
      data/                   sample data and map style
    scripts/                simulate, generate style/icons/keys, copy worker; backend helpers
    public/sw.js            service worker: offline, map and push notifications
    public/mapa/            Pasto tiles and label fonts
  backend/                the FastAPI backend (see docs/backend/ARCHITECTURE.md)
  mobile/                 the Expo app (not started yet)
docs/backend/             backend architecture and glossary
secrets/                  encrypted secrets (sops + age)
scripts/                  local Postgres and the sops check (shared tooling)
```
