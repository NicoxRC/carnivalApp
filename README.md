# Sigue el Desfile

App web (PWA) para seguir en vivo los desfiles del Carnaval de Negros y Blancos de Pasto.

**Estado: Fase 1 (demo) terminada, con el diseño aplicado.** Se puede abrir, mover un
desfile por la senda y ver el ETA calculándose. Sin subida de fotos, sin autenticación,
sin panel de admin.

---

## Arrancar

```bash
npm install
npm run dev
```

Abrir <http://localhost:3000>. El desfile no se mueve solo: hay dos formas de moverlo.

**1. El botón (para enseñarlo).** En el mapa, abajo a la izquierda: *Modo demo →
Iniciar desfile*. Corre dentro del proceso de Next. Es lo que se usa en una sala de juntas.

**2. El script (para desarrollar).** En otra terminal:

```bash
npm run simular -- --velocidad=1.5 --desfile=demo
```

| Opción | Por defecto | Qué hace |
|---|---|---|
| `--velocidad` | `1.5` | km/h de la cabeza cuando anda |
| `--intervalo` | `12` | segundos entre reportes |
| `--separacion` | `550` | metros entre cabeza-mitad-cola |
| `--paradas` | `true` | `false` para que no se detenga nunca |
| `--inicio` | `0` | metros iniciales de la cabeza |
| `--desfile` | `demo` | id del desfile |
| `--url` | `http://localhost:3000` | contra qué despliegue apuntar |

Los dos caminos hacen `POST /api/posiciones` con el mismo payload que enviará el celular
de un reportero en Fase 2. **No hay un camino "de mentiras" paralelo al real**: lo que se
prueba en octubre es el mismo código que corre el 31 de diciembre.

---

## La idea que sostiene todo: la senda es 1D

La senda es una ruta fija conocida. Cualquier punto —la cabeza, la cola, el usuario— se
proyecta sobre esa línea y se reduce a **un solo número: metros desde el inicio**
(`src/lib/senda.ts`). El ETA es aritmética sobre ese número (`src/lib/eta.ts`).

Nada en la app razona en dos dimensiones. Si algo empieza a necesitarlo, casi seguro está
mal planteado.

---

## Los dos adaptadores de datos

Una sola interfaz (`src/lib/datos/adaptador.ts`), dos implementaciones. El interruptor es
`NEXT_PUBLIC_DATOS`.

| | `local` (por defecto) | `supabase` |
|---|---|---|
| Almacén | memoria del proceso Next | Postgres |
| Tiempo real | SSE (`/api/estado/stream`) | Supabase Realtime |
| Sobrevive a un reinicio | no | sí |
| Sirve en Vercel | **no** | sí |
| Probado | sí, de punta a punta | **no** |

### Estado honesto del adaptador de Supabase

Está **escrito pero nunca ejecutado contra un proyecto real**, porque todavía no hay
credenciales. Conectarlo debería ser solo variables de entorno, pero hay que darlo por no
probado hasta que alguien lo corra:

1. Crear el proyecto en Supabase (eso lo tienes que hacer tú: son credenciales).
2. Pegar `supabase/schema.sql` en el SQL Editor y ejecutarlo.
3. Copiar `.env.example` a `.env.local` y llenar las tres variables.
4. Poner `NEXT_PUBLIC_DATOS=supabase`.
5. Cargar la senda real en la tabla `sendas`.

El adaptador local **no funciona en Vercel**: cada invocación serverless es un proceso
distinto, así que el store en memoria y el `setInterval` del simulador no sobreviven.
Para un demo desplegado hay que conectar Supabase.

---

## Cambiar la senda

⚠️ **El trazado que viene NO es la senda oficial.** Es una polilínea aproximada sobre
Pasto, dibujada a mano para poder desarrollar. Las calles que nombran los hitos son
orientativas, no verificadas. La app lo advierte en pantalla mientras siga así.

Para reemplazarla, editar `src/data/senda-carnaval.ts`:

- `geojson.geometry.coordinates`: el recorrido oficial como `[lng, lat]` (¡en ese orden!),
  del punto de salida al de llegada.
- `hitos`: nombres de referencia, cada uno apuntando a un índice del array de coordenadas.
- `oficial: true` cuando de verdad lo sea — eso apaga el aviso amarillo.

La longitud y los metros de cada hito se calculan solos al cargar. Va en TypeScript y no
en JSON porque el script `npm run simular` corre fuera del bundler.

---

## Lo que falta antes de que esto sirva de verdad

Ordenado por lo que más duele si se ignora.

**1. Los tiles del mapa no aguantan el 31 de diciembre.**
Hoy se usan tiles de `tile.openstreetmap.org`, que son gratis y no piden tarjeta. Su
política de uso **no admite el tráfico de una app masiva**; con miles de personas en la
senda es bloqueo casi seguro. Hay que migrar a tiles propios (Protomaps con un `.pmtiles`
servido desde Vercel/R2, o MapTiler) antes del piloto. Es un cambio de una constante en
`src/components/MapaDesfile.tsx`, pero hay que hacerlo con tiempo.

**2. Probarlo con red mala.** Está pensado para eso —service worker que cachea el armazón,
la senda y los tiles; reconexión con backoff y jitter; siempre el último dato con su hora
en vez de un spinner— pero **no se ha probado con throttling 3G**. Es el riesgo número uno
del proyecto y sigue sin verificarse.

**3. Íconos PNG.** El manifest apunta a SVG. Android los acepta; iOS quiere PNG de 192 y
512 px para el ícono de pantalla de inicio. Hay que exportarlos desde `public/icono.svg`.

**4. El piloto en otro evento.** Una ciclovía, una procesión, cualquier cosa con recorrido.
Si el 31 de diciembre falla, no hay segunda oportunidad hasta el año siguiente.

**5. Corpocarnaval.** Sin el aval no hay senda oficial, ni programación real, ni
legitimidad para vender pauta sobre patrimonio de la UNESCO.

---

## Decisiones que quedaron tomadas en el código

Cosas que la spec no cerraba y que se resolvieron de una manera concreta. Si alguna no
convence, aquí está el porqué:

- **El ETA se muestra en rangos de 5 minutos**, asimétricos (−25 % / +40 %): un desfile se
  atrasa mucho más fácil de lo que se adelanta.
- **Con menos de 90 segundos de historial no se usa la velocidad medida**, sino una
  nominal de 1,2 km/h, y la UI lo dice ("a ritmo estimado"). Con 30 segundos de datos el
  ruido del GPS domina la señal y el número medido no mide nada.
- **Techo de 6 km/h.** Por encima es un salto de GPS, no un desfile veloz: se descarta la
  medición en vez de mostrar un ETA absurdo.
- **Dos umbrales de detención, no uno.** La spec pedía avisar a los 10 minutos detenido;
  eso deja al usuario sin señal útil durante nueve. A los 3 minutos aparece un aviso suave
  ("sin avanzar hace 4 min") y a los 10 el titular en rojo.
- **La senda va en el bundle**, no se pide por red. Son ~2 KB y así el mapa se dibuja sin
  depender de la celda. `/api/senda` queda para el service worker y herramientas.
- **`posiciones.rol` está desnormalizado** en el esquema SQL. La lectura corre cada pocos
  segundos con miles de clientes encima y no puede pagar un join.
- **Sin política de INSERT en RLS.** Solo el backend escribe. En Fase 2, cuando el celular
  del reportero mande GPS directo, hay que añadir una que valide `auth.uid()`.

---

## Ubicarse por referencias, no por calles

La gente no se ubica por "carrera 27 con calle 18": se ubica por la iglesia, el centro
comercial, el colegio. Por eso los hitos de la senda son **puntos reconocibles**, no
cruces de calles, y la app habla en esos términos:

- En el mapa, cada hito lleva su icono y su nombre. Por debajo de cierto zoom se ocultan
  los nombres para que no se pisen.
- El ETA dice "va por Iglesia de Cristo Rey" o "va entre Champagnat y Cristo Rey".
- Al usuario se le confirma dónde cree la app que está — "estás por Unicentro" — que es
  la única forma de que se dé cuenta si el punto está mal.

Los hitos se editan en `src/data/senda-carnaval.ts`: nombre, nombre corto, tipo y
coordenada. Cada uno se proyecta solo sobre la senda.

⚠️ **Los hitos que vienen son una plantilla.** Los nombres son de sitios que existen en
Pasto, pero las coordenadas están puestas a ojo sobre un trazado que tampoco es el real.
Hay que corregirlos con conocimiento local antes de usarlos.

## PC y móvil

Un solo código, dos formas. El corte está en `lg` (1024 px).

| | Móvil | Escritorio |
|---|---|---|
| Navegación | barra de pestañas abajo, dentro del área segura | riel lateral de 92 px, alto completo |
| Barra de ETA / ficha | hoja a todo el ancho, pegada abajo | tarjeta de 420 px flotando abajo a la izquierda |
| Controles del mapa | abajo a la izquierda | abajo a la derecha, para no chocar con la tarjeta |
| Hoy · Desfiles | una columna | dos columnas; la tarjeta en vivo ocupa las dos |
| Fotos | dos columnas | cuatro columnas |

El razonamiento: a 1.500 px de ancho, un titular de 26 px centrado en toda la pantalla se
lee **peor**, no mejor, y una barra de cuatro pestañas repartida en metro y medio no la usa
nadie. Por eso en escritorio la información se agrupa a un lado y el mapa se queda con todo
el espacio, que es lo único que gana de verdad con una pantalla grande.

También se quitó `maximum-scale=1` del viewport: bloquear el zoom deja fuera a quien
necesita agrandar el texto, y MapLibre ya captura sus propios gestos dentro del mapa.

## Subirlo a producción

⚠️ **Tal como está no se puede desplegar en Vercel.** El adaptador `local` guarda todo en
memoria del proceso, y en serverless cada petición es un proceso distinto: las posiciones
del desfile y el gentío se perderían entre una carga y la siguiente. No es un bug, es la
frontera del modo de desarrollo.

Pasos, en orden:

**1. Supabase (lo hacés vos — son credenciales).**
   1. Crear un proyecto en supabase.com (plan gratuito sobra).
   2. SQL Editor → pegar `supabase/schema.sql` → Run.
   3. Project Settings → API → copiar `URL`, `anon public` y `service_role`.

**2. Conectar (lo hago yo con esas tres llaves).**
   - `.env.local` con `NEXT_PUBLIC_DATOS=supabase` y las tres variables.
   - Cargar la senda en la tabla `sendas` y crear la fila del desfile.
   - **Probar el adaptador de Supabase de punta a punta**, que hoy está escrito pero nunca
     ejecutado contra un proyecto real. Hay que dar por hecho que algo falla la primera vez.

**3. Vercel (cuenta tuya).**
   - El proyecto todavía **no es un repositorio git**; hay que iniciarlo y subirlo.
   - Importar el repo en Vercel y poner las mismas variables de entorno.
   - `SUPABASE_SERVICE_ROLE_KEY` va solo como variable de servidor. Nunca con prefijo
     `NEXT_PUBLIC_`, que la publicaría al navegador.

### Lo que hay que saber antes de enseñárselo a alguien

- **Los tiles del mapa siguen siendo de OpenStreetMap.** Para un demo con pocas visitas
  está bien. Para tráfico real **no**: su política de uso no lo admite y bloquean. Hay que
  migrar a tiles propios antes del piloto, no antes del demo.
- **El simulador embebido (`Modo demo`) no funciona en Vercel**, porque es un `setInterval`
  dentro del proceso. Para mover el desfile en el despliegue se usa el script:
  `npm run simular -- --url=https://tu-despliegue.vercel.app`.
- **Sigue sin probarse con red mala**, que es el riesgo número uno del proyecto.
- La senda, los hitos, los comercios y la programación siguen siendo **datos de ejemplo**.

## Comercios en el mapa

La capa **Comercios** reúne restaurantes, tascas, cafés, tiendas y droguerías. Cada uno es
un marcador tocable: al tocarlo se abre su ficha abajo, en lugar de la barra de ETA, con
qué es, dónde queda, a cuánto está de vos, a qué hora abre y —si contrató— su oferta.

Va todo junto en un solo filtro a propósito: para alguien parado en la senda, «dónde como,
dónde compro, dónde hay baño» es la misma pregunta. El icono distingue de qué tipo es cada
sitio; el color no cambia por categoría porque con ocho colores el mapa se vuelve ilegible
justo donde hay más cosas.

### Cómo se monetiza sin que parezca un anuncio

La ficha es una **ficha de sitio, no un banner**. Primero va lo que le sirve a quien la
abre; la oferta va después, y solo la tienen los que contrataron.

- **Aparecer en el mapa no depende de pagar.** En `comercios-ejemplo.json` hay negocios con
  `plan: null` que salen igual. El directorio vale por completo, no por pagado.
- **Lo que da el plan** es la oferta (`promo`) en la ficha.
- **Lo pagado lleva el sello «PAUTA»**, discreto, junto al botón. Discreto porque no es lo
  primero que importa; presente porque si el usuario no puede distinguir qué es pauta y qué
  no, la confianza que se le vende al anunciante deja de existir — y en Colombia la
  publicidad no identificada es un problema con la SIC, no solo de estilo.

Si querés que el sello desaparezca del todo, decímelo y lo quitamos, pero esa es la
decisión que hay detrás.

Los comercios se editan en `src/data/comercios-ejemplo.json`. ⚠️ Los diez que vienen son
**inventados**: ningún negocio real ha contratado nada.

## Mapa de gentío

La capa "Gentío" pinta el recorrido de verde a rojo según cuánta gente hay en cada tramo
de 100 m. Sirve para decidir dónde pararse.

**Cómo se mide.** Cada celular manda una vez por minuto **el número de tramo** en el que
está — nunca lat/lng, nunca un historial. En la base hay una fila por dispositivo que se
sobrescribe; el id es un aleatorio del navegador que solo sirve para no contar dos veces
a la misma persona.

**Dos salvaguardas, y por qué existen:**

1. **Umbral global.** Por debajo de 50 usuarios activos la capa no pinta nada y dice que
   no hay muestra suficiente. Sin esto, el 31 de diciembre a las 9 de la mañana el mapa
   diría "vacío" en una cuadra con cinco mil personas, que es la peor manera posible de
   equivocarse.
2. **Un tramo sin muestras no es un tramo vacío.** Los tramos con menos de 3 reportes
   quedan sin dato en vez de pintarse de verde.

**El consentimiento es explícito.** Al encender la capa por primera vez se pregunta si
quiere aportar su posición, con la opción de "solo mirar". Mirar no obliga a compartir.

**Lo que esta función NO puede hacer, y conviene tener presente:**

- **Mide usuarios de la app, no gente.** Si en una cuadra hay 3.000 personas y ninguna
  tiene la app, sale sin dato. La correlación mejora con la adopción, y el primer año la
  adopción es una incógnita.
- **Solo mide sobre la senda.** El modelo es 1D: no sabe nada de las calles laterales ni
  de las plazas fuera del recorrido.
- **Decir "acá hay campo" tiene un riesgo que decir "allá está lleno" no tiene.** Mandar
  gente a un punto puede llenarlo, o dejarla en un sitio sin visibilidad. Si el dato
  resulta flojo en el piloto, lo prudente es dejar solo los tramos rojos.

## El diseño aplicado

La interfaz viene de `design/Sigue el Desfile.dc.html`. Cambió el tema (de oscuro a
papel claro de alto contraste), la tipografía (Alfa Slab One para los titulares), la voz
(pastuso con voseo) y la navegación (de 2 pestañas a 4).

Decisiones que tuve que tomar porque el diseño no las cubría o no se podían montar tal cual:

- **Agua y Baños quedaron fuera de las capas del mapa.** El diseño proponía Desfile ·
  Agua · Baños · Tarima, pero no existe ninguna fuente de datos para agua ni baños. Un
  baño inventado en un mapa que alguien va a usar para buscar un baño es peor que no
  ofrecer el filtro. En su lugar van **Desfile · Tarimas · Tascas**, que sí salen de
  datos reales. Vuelven en cuanto Corpocarnaval publique esos puntos.
- **En Fotos no se pintan @usuarios ni contadores de "me gusta".** El diseño los traía,
  pero inventar nombres de gente y cifras de likes en una app con el nombre del Carnaval
  es fabricar prueba social falsa. La pantalla muestra el armazón con un aviso de que las
  fotos llegan en Fase 2, con moderación.
- **El diseño solo resolvió el estado feliz del ETA.** Los otros seis (detenido, ya pasó,
  te está pasando, sin ubicación, lejos de la senda, sin reportes) están escritos en el
  mismo registro. Hicieron falta dos colores que el diseño no traía: un rojo de alerta y
  un ámbar oscuro legible sobre blanco.
- **La cabeza, la mitad y la cola siguen las tres en el mapa.** El artboard solo dibujaba
  la cabeza, pero saber dónde va cada una es la promesa número uno del producto.
- **Los PDI se distinguen por forma, no por color.** El diseño usa morado para Tarima, que
  es el mismo morado de la cola. Los PDI son cuadrados redondeados y el desfile círculos.
- **De la fuente solo se sirve el subconjunto `latin`** (19 KB). El export traía además
  latin-ext y vietnamita: 27 KB que nadie iba a usar el 31 de diciembre.
- **Erratas del diseño corregidas:** «segueí» → «seguí», y «toda la programa» → «toda la
  programación».
- **Copia ajustada a lo que existe:** el inicio decía «con baños, agua y tarima»; ahora
  dice «con tarimas y tascas», que es lo que la app enseña de verdad.

## Estructura

```
src/
  app/
    page.tsx              mapa en vivo
    hoy/                  qué hay hoy
    desfiles/             programación de los 6 días
    fotos/                muro de fotos (armazón, sin backend)
    api/
      posiciones/         ingesta — la única puerta de entrada
      estado/             snapshot + stream SSE
      senda/              la ruta (cacheable)
      simulacion/         el botón de demo
  components/
    Inicio.tsx            primera pantalla, antes de pedir el GPS
    MapaDesfile.tsx       MapLibre: senda en 3 tramos, marcadores, PDI
    BarraEta.tsx          la hoja blanca: los 7 estados del ETA
    Pantalla*.tsx         una por ruta
  lib/
    senda.ts              proyección 1D (Turf)
    eta.ts                velocidad, rangos, detención
    datos/                adaptador local + adaptador Supabase
    simulacion/motor.ts   el desfile falso, compartido por script y botón
  data/                   senda, programación y desfiles de ejemplo
design/                   el .dc.html original y lo extraído del export
scripts/simular-desfile.ts
supabase/schema.sql
public/sw.js              service worker
public/fuentes/           Alfa Slab One (subconjunto latin)
```
