# Sigue el Desfile — brief for the visual design

> **SUPERSEDED.** This is the brief that was sent to design. The design came back and is
> implemented: light paper theme, Alfa Slab One, the Pasto voice and 4 tabs. It is kept
> because it records the reason for each constraint and the self-critique that led to the
> redesign. For the current state, see the README («The applied design»).
>
> Routes, token names and texts below are the ones the app had at the time (Spanish routes,
> dark theme). The quoted interface texts are literal and stay in Spanish.

A document to take to a design tool and come back with screens. Everything here comes
from code that already worked, not made up: the texts are literal, the colours are the
real tokens and the states are the ones the app could show.

---

## 1. What it is, in one sentence

I am standing on a pavement in Pasto during the parade. I open the app and in under
**3 seconds** I know **how long until the parade reaches me**.

Everything else is secondary. If an element on screen does not help answer that faster,
it competes with the only thing that matters.

---

## 2. The real context of use (this should drive the design)

It is not a desk or sofa app. The conditions are hostile, and all at once:

- **In full sun**, between 9 a.m. and 5 p.m. High contrast, screen brightness at maximum.
- **One hand only.** The other holds a child, a beer, a foam can or a phone that is
  recording. Everything tappable has to be in the lower third.
- **Standing in a crowd**, being pushed. No fine gestures, no small targets.
- **Battery at 30 %** in mid-afternoon, after hours of recording.
- **Saturated network.** Thousands of people in a few blocks. The app has to look useful
  even when the data is 2 minutes old.
- **First-time user.** The app is used 6 days a year: nobody remembers how it worked. No
  learning carries over between uses. Zero tolerance for interfaces that need decoding.
- **Many older people and tourists.** Not an early-adopter audience.

Direct consequence: large type, high contrast, one idea per screen, and the main figure
readable at arm's length.

---

## 3. Screens

### Done (phase 1)

| Route | What it is |
|---|---|
| `/` | Full-screen map + ETA bar fixed at the bottom. It is the app. |
| `/hoy` | The day's schedule as a chronological list with distances. |

Navigation: a bottom bar with 2 tabs (Mapa · Hoy).

### To design (phases 2 and 3, no UI yet)

| Route | What it is | Design note |
|---|---|---|
| `/reportero` | Private panel of the 3 reporters | Dark, minimal screen: they carry it for 4 h with the screen on. A huge start/stop button and a "last sent X s ago" counter. Design for battery, not for show. |
| `/fotos` | The public's photo wall | Grid, each photo tagged with the point of the course where it was taken. |
| `/admin` | Internal panel | State of the 3 reporters, photo moderation, creating events. The public never sees it. |
| — | Geolocated promotions | Phase 3. Must look clearly like advertising. |

---

## 4. The central element: the ETA bar

It is the bar fixed at the bottom. **It is the product.** It has 7 states and all of them
happen in real life. The design has to solve all of them, not only the nice one.

The texts are literal from the code.

| # | State | Headline | Supporting line |
|---|---|---|---|
| 1 | **Arriving** (the normal case) | `El desfile llega a donde estás en` **`20–35 min`** | `La cabeza va a 2,1 km, a 1,5 km/h` |
| 2 | **Arriving, speed not measured** (first 90 s) | same as 1 | `La cabeza va a 2,1 km, a ritmo estimado (1,2 km/h)` |
| 3 | **Arriving but stuck** | same as 1 | `La cabeza va a 2,1 km, a 0,8 km/h · sin avanzar hace 4 min` (the suffix in yellow) |
| 4 | **Stopped** (>10 min) | **`El desfile está detenido`** (red) `— lleva 12 min sin avanzar` | `La cabeza está a 1,4 km de donde estás` |
| 5 | **Here** (<120 m) | `El desfile está pasando por donde estás` (orange) | `Estás a 80 m de la cabeza` |
| 6a | **The head has passed** | `La cabeza ya pasó` `— la cola va a 470 m` | `La cabeza está 620 m más adelante` |
| 6b | **Everything has passed** | `El desfile ya pasó por donde estás` | `La cabeza está 1,5 km más adelante` |
| 7a | **No location** | `¿Dónde estás parado?` | `Sin tu ubicación no se puede calcular cuánto falta.` + 2 buttons |
| 7b | **Far from the course** (>600 m) | `Estás lejos de la senda` | `Acércate a la senda o marca a mano dónde vas a esperarlo.` + 2 buttons |
| 7c | **No reports** | `El desfile todavía no ha arrancado` | `Ningún reportero ha enviado posición todavía.` |

The two buttons of the 7 states are **`Usar mi ubicación`** (primary) and
**`Marcar en el mapa`** (secondary).

### Bar footer (always visible)

A line of metadata, 11 px at the time:

`● en vivo · último dato hace 2 min (10:52 a. m.) · cabeza por Av. Los Estudiantes con Calle 22`

The coloured dot shows the connection:

| State | Text | Colour at the time |
|---|---|---|
| connecting | `conectando…` | grey |
| live | `en vivo` | green `#3ddc97` |
| retrying | `reconectando…` | yellow `#ffc61a` |
| offline | `sin conexión` | red `#ff4d6a` |

**Hard rule:** never an endless spinner. Without network, the last known value is shown
**with its time**. A labelled old value is infinitely better than a spinning wheel.

---

## 5. The map

- It fills the screen; everything else floats on top.
- The course is a line in three coloured stretches, and that is what communicates fastest:
  - **grey `#4b4b57`**: where the parade has already passed
  - **orange `#ff6a1f`**: the body of the parade right now (from the tail to the head)
  - **white `#f7f7f5`**: what is ahead, where people are waiting
- Three round markers, labelled **1 / 2 / 3** at the time:
  - **Head**: orange, 34 px (the largest, it is the one that matters)
  - **Middle**: yellow, 26 px
  - **Tail**: purple, 26 px
- **My location**: a 20 px blue dot `#2f9bff` with a halo.
- A reporter silent for >5 min **is not removed**: the marker dims (42 % opacity +
  greyscale). Its last position is still information.
- The base map is deliberately desaturated and darkened so the course stands out.

### Header at the time

A floating card at the top with the parade's name and the legend of the three posts with
their last signal: `Cabeza · hace 23 s`, `Mitad · sin señal`, `Cola · —`.

### Floating controls

`Ir a la cabeza` and `Centrar en mí` (or `Ver toda la senda` without a location), as pills
above the ETA bar.

---

## 6. Palette and type at the time (a starting point, not dogma)

Reasoning: it is the **Carnaval de Negros y Blancos** (Blacks and Whites). The identity is
black and white. Colour is reserved for the only thing that must be told apart at a
glance (the three points of the parade and the user) and for nothing else.

```
Background / surfaces
  --color-tinta    #0a0a0c   background
  --color-tinta-2  #16161b   cards
  --color-tinta-3  #24242c   raised surface
  --color-borde    #32323d

Text
  --color-cal      #f7f7f5   main
  --color-cal-2    #b9b9c2   secondary
  --color-cal-3    #7c7c88   metadata

Semantic
  --color-cabeza   #ff6a1f   head of the parade
  --color-mitad    #ffc61a   middle
  --color-cola     #a06bff   tail
  --color-usuario  #2f9bff   me
  --color-alerta   #ff4d6a   stopped / offline
  --color-ok       #3ddc97   live
```

Type: the system's. Sizes at the time: ETA headline **21.6 px semibold**, supporting line
**13 px**, metadata **11 px**, posts legend **10 px**.

---

## 7. What cannot change (product decisions, not style)

1. **The ETA is always shown as a range** of 5 minutes: "20–35 min". Never an exact
   minute. A "27 min" that misses burns the credibility on the one day of the year that
   matters.
2. **The age of the data is always visible.** "hace 2 min" is not an optional detail.
3. **Sponsored content is marked as sponsored.** Disguising it as content breaks exactly
   the trust being sold to the advertiser.
4. **The head is the most prominent** of the three. It is the one that answers the question.
5. **A reporter without signal is dimmed, not removed.**
6. **Everything tappable in the lower third**, respecting the iOS safe area.

---

## 8. Where I think the design at the time was weak

A self-critique of what I had built. These are the points where a real design pass adds
the most value:

1. **The bottom is congested.** Four things compete: the ETA bar, the 2-tab nav, the
   floating controls and the announcements. All of it lives in the same lower third. It is
   the biggest composition problem.
2. **The dark theme may be a mistake in full sun.** I chose it for battery and because the
   map stands out, but the parades are by day, outdoors, and dark mode performs worse under
   direct light. A high-contrast light version, or a theme that changes with the time of
   day, is worth exploring.
3. **10–11 px text outdoors is too small.** The metadata line and the posts legend are
   probably unreadable standing in the sun.
4. **The markers say "1 / 2 / 3"** and that does not explain itself. They need a visual
   solution that says head/middle/tail without a legend.
5. **No Carnival identity at all.** The Carnival has enormous visual richness (masks,
   floats, paper, colour) and the app uses none of it. It is correct and anonymous. There
   is a lot to gain here, as long as it does not get in the way of legibility.
6. **There is no first use.** The first-time user lands straight on the map with nothing
   explaining what the three points are or why the location is asked for.
7. **The yellow band of the provisional course** is permanent noise. It will go when the
   official course arrives, but meanwhile it needs a better place.
8. **The "demo mode" panel is development chrome** inside the product's UI. It should not
   exist on the screen the public sees.
9. **`/hoy` lacks hierarchy.** What is happening *now* should dominate the screen; at the
   time it only had an orange border and a small label.

---

## 9. Technical constraints that shape the design

- **Installable PWA**, not a native app. No browser bar once installed, but there is a
  notch and a gesture bar: `safe-area-inset` has to be respected.
- **Mobile first, portrait.** The target is 375 × 812. There is no desktop design and none
  is needed.
- The map is **MapLibre**: markers are plain HTML, so they can be anything. The course line
  is drawn in WebGL and supports colour per stretch, not textures.
- The app has to **open without network** (service worker). No heavy graphics that only
  load online; illustrations, if any, have to fit in the cache.
- Icons were SVG. **192 and 512 px PNGs were missing** for the iOS home-screen icon.

---

## 10. Deliverable that helps me back

To build it fast, the most useful things are:

1. The **7 states of the ETA bar** solved, not only the happy one.
2. The **composition of the lower third** with everything living together (ETA + nav +
   controls).
3. Final **colour tokens**, with their values.
4. A **type scale** with concrete sizes.
5. The **three markers + the user's**, including the dimmed state.
6. `/hoy`: the event card in its three states (upcoming, now, over) and the sponsored
   variant.

With that I take it straight to code. The token names already existed in
`apps/web/src/app/globals.css`; keeping those names and changing only the values makes the
change almost mechanical.
