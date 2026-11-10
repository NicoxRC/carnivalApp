# Sigue el Desfile

App web (PWA) para seguir en vivo los desfiles del Carnaval de Negros y Blancos de Pasto.

**Estado: funciona de punta a punta en modo local; el camino de producción (Supabase)
está escrito y sin probar.** Se puede abrir, mover un desfile por la senda, ver el ETA,
recibir un aviso cuando se acerca, subir fotos y administrar todo desde `/admin`. Lo que
falta para salir al público está en «Lo que falta antes de que esto sirva de verdad».

---

## Arrancar

```bash
npm install
npm run dev
```

Abrir <http://localhost:3000>. El desfile no se mueve solo: hay tres formas de moverlo.

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

Contra un despliegue hace falta la llave de ingesta: `INGESTA_TOKEN=… npm run simular --
--url=https://…` (o `--token=…`).

**3. Un reportero de verdad.** Poner `ADMIN_CLAVE` en `.env.local`, entrar a `/admin`,
crear un reportero en la pestaña *Reporteros* y abrir `/reportero` con ese código en un
celular. Ver «Panel de reporteros».

Los tres caminos hacen `POST /api/posiciones` con el mismo payload. **No hay un camino
"de mentiras" paralelo al real**: lo que se prueba en octubre es el mismo código que corre
el 31 de diciembre.

---

```bash
npm run typecheck    # tipos
npm test             # pruebas del ETA, la senda, las fechas y las validaciones
npm run build
```

Los tres corren en cada PR (`.github/workflows/ci.yml`).

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
| Almacén | memoria del proceso Next + copia en `.datos-local/` de lo editado en `/admin` | Postgres + Storage |
| Tiempo real | SSE (`/api/estado/stream`) | Supabase Realtime |
| Sobrevive a un reinicio | lo editado sí (comercios, reporteros, programación, fotos); lo en vivo no | sí |
| Sirve en Vercel | **no** | sí |
| Probado | sí, de punta a punta | **no** |

### Estado honesto del adaptador de Supabase

Está **escrito pero nunca ejecutado contra un proyecto real**, porque todavía no hay
credenciales. Conectarlo debería ser solo variables de entorno, pero hay que darlo por no
probado hasta que alguien lo corra:

1. Crear el proyecto en Supabase (eso lo tienes que hacer tú: son credenciales).
2. Pegar `supabase/schema.sql` en el SQL Editor y ejecutarlo.
3. Copiar `.env.example` a `.env.local` y llenar las tres variables de Supabase (la
   `service_role` es obligatoria: el servidor la usa para escribir y para leer los
   reporteros) y las de los paneles.
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

**1. Conectar Supabase y desplegar con HTTPS.** Todo lo de este README se probó en modo
local. El adaptador de Supabase, el bucket de fotos y Realtime **nunca se han ejecutado**.
Y sin HTTPS no se puede probar el panel de reporteros en un celular: el navegador no
entrega el GPS ni mantiene la pantalla encendida por `http://` (salvo en `localhost`).

**2. Probar el panel de reporteros caminando.** En iPhone y en Android, con la pantalla
encendida cuatro horas, batería externa y señal mala. En la web el GPS se detiene con la
pantalla bloqueada: si el Wake Lock falla en algún celular del equipo, hay que saberlo
antes del 31, no ese día.

**3. Probarlo con red mala.** Está pensado para eso —service worker que guarda el armazón,
el mapa y la programación; reconexión con backoff y jitter; siempre el último dato con su
hora— y se probó apagando el servidor, pero **no con throttling 3G real**.

**4. Los avisos push en iPhone.** Solo funcionan con la app instalada en la pantalla de
inicio (iOS 16.4+). Sin eso queda el aviso local, que suena solo con la app abierta. Hay
que probarlo en un iPhone de verdad y decidir si se le pide a la gente instalarla.

**5. La política de privacidad.** `/privacidad` describe con exactitud lo que hace el
código, pero es un **borrador**: falta el responsable del tratamiento, un contacto real y
la revisión de un abogado frente a la Ley 1581 de 2012.

**6. El piloto en otro evento.** Una ciclovía, una procesión, cualquier cosa con recorrido.
Si el 31 de diciembre falla, no hay segunda oportunidad hasta el año siguiente.

**7. Corpocarnaval.** Sin el aval no hay senda oficial, ni programación real, ni servicios
(baños, hidratación) que cargar, ni legitimidad para vender pauta sobre patrimonio de la
UNESCO.

**Limitaciones conocidas que siguen abiertas:**

- **Un solo administrador con una sola contraseña.** No hay usuarios, ni registro de quién
  cambió qué, ni forma de cerrar una sesión robada antes de 12 horas. Resolverlo bien es
  parte de decidir el backend definitivo.
- **El gentío se puede seguir falseando con muchas IPs.** Los ids de dispositivo los firma
  el servidor y emitirlos tiene tope por IP, así que ya no basta un bucle; pero no es
  inviolable. Y sigue midiendo usuarios de la app, no gente.
- **La CSP permite scripts en línea** (`'unsafe-inline'`): quitarlo exige nonces por
  petición. Y queda una vulnerabilidad alta en el `postcss` que trae empaquetado Next 15;
  se va subiendo a Next 16.
- **No hay lint ni monitoreo de errores.** Los fallos de la API quedan en los registros
  del servidor (`[api]`) y `/api/salud` sirve para un monitor externo, pero nadie avisa
  solo si algo se cae.
- **La proyección 1D asume que la senda no pasa dos veces por el mismo sitio.** Si el
  recorrido oficial tiene tramos casi paralelos, un punto puede pegarse al tramo
  equivocado; habría que acotar la proyección al entorno de la última posición.

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
- **La app sigue UN desfile: el «actual».** El que está en curso; si no hay, el de hoy; si
  no, el próximo (`src/lib/desfiles.ts`). No se le pregunta al usuario cuál quiere ver, y
  los reporteros siempre escriben en ese. Pedir un desfile que no existe da 404: nunca se
  crea uno por nombrarlo.
- **Con la cabeza más de 5 min callada no se da un tiempo.** El titular pasa a «sin
  noticias del desfile hace 8 min». Un «llega en 20–35 min» calculado sobre dónde ESTABA
  el desfile es un dato viejo disfrazado de nuevo.
- **Un dato servido desde la caché no cuenta como dato nuevo.** Sin red, el service worker
  devuelve la última copia; la app la muestra, pero no la marca «en vivo» ni reinicia su
  antigüedad, y nunca deja que pise algo más reciente.
- **Un rol, un emisor.** Si dos reporteros tienen el mismo rol, manda el que ya venía
  mandando; el otro queda de respaldo y toma el rol solo si el titular se calla un minuto
  (`RELEVO_MS`). Dos celulares a cuadras de distancia hacían saltar la cabeza.
- **Un GPS de más de ±150 m se descarta** en el servidor (y de más de ±100 m ni se envía).
- **«Hoy» es la fecha de Pasto**, no la del celular ni UTC (`src/lib/fecha.ts`).
- **El freno a adivinar contraseñas es una espera, no un bloqueo.** Cada fallo hace que
  la siguiente respuesta tarde más (hasta 5 s). Con bloqueo, seis intentos de cualquiera
  dejaban fuera al administrador.
- **Sin política de INSERT en RLS.** Solo el backend escribe. En Fase 2, cuando el celular
  del reportero mande GPS directo, hay que añadir una que valide `auth.uid()`.

---

## El mapa base

Las teselas son propias: `public/mapa/pasto.pmtiles` (≈2,4 MB, Pasto entero hasta z15,
derivado de OpenStreetMap por Protomaps) y las fuentes de las etiquetas en
`public/mapa/fuentes/`. No se depende de `tile.openstreetmap.org`, cuya política de uso no
admite una app masiva.

- **Abre sin red.** El service worker guarda el archivo entero en la primera visita y
  recorta desde la caché los pedazos que pide el visor. Probado: con la red cortada el
  mapa se dibuja completo.
- **El estilo** (colores de papel, sin puntos de interés del mapa base) se genera con
  `npm run mapa:estilo` y queda versionado en `src/data/estilo-mapa.json`, para no mandarle
  al celular la librería de estilos.
- **El worker de MapLibre** se copia desde `node_modules` a `public/mapa/` antes de cada
  `dev` y `build` (`npm run mapa:worker`): desde la versión 6 no viene embebido.
- **Actualizar las teselas** (una vez al año basta):

  ```bash
  go install github.com/protomaps/go-pmtiles@latest
  pmtiles extract https://build.protomaps.com/AAAAMMDD.pmtiles public/mapa/pasto.pmtiles \
    --bbox=-77.33,1.16,-77.23,1.26 --maxzoom=15
  ```

  Y subir `VERSION` en `public/sw.js`, o los celulares se quedan con el archivo viejo.
  `NEXT_PUBLIC_MAPA_PMTILES` permite apuntar a otra ruta **del mismo dominio**. Si el
  archivo se sirve desde otro dominio (R2, S3), el mapa funciona con red pero el service
  worker no lo guarda: se pierde el mapa sin señal.

## Quién puede escribir

Leer el desfile es público. Escribir no: una cabeza falsa le miente a toda la senda a la
vez. Todo pasa por `src/lib/sesion.ts`:

| Quién | Cómo entra | Qué puede hacer |
|---|---|---|
| Administrador | `/admin` con `ADMIN_CLAVE` | Todo: programación, comercios, reporteros, avisos, fotos, corregir posiciones |
| Reportero | `/reportero` con un código que genera el admin | Mandar posiciones del desfile actual, siempre con su rol |
| Público | sin cuenta; un id de dispositivo firmado por el servidor | Aportar al gentío y subir fotos (quedan pendientes de moderación) |
| Script / herramientas | `Authorization: Bearer <INGESTA_TOKEN>` | Mandar posiciones |

- Las sesiones son cookies firmadas con `SESION_SECRETO`. No hay tabla de sesiones.
- Del código del reportero se guarda solo el hash. Se muestra una vez al crearlo; si se
  pierde, se genera otro y el viejo deja de servir. Desactivar a un reportero corta
  también las sesiones que tenga abiertas.
- Cada intento fallido hace más lenta la siguiente respuesta desde esa IP (hasta 5 s).
  Vive en memoria del proceso: en serverless es un freno, no una muralla.
- El público no tiene cuenta. Para el gentío y las fotos se usa un id de dispositivo que
  emite y firma el servidor (`POST /api/dispositivo`), con tope de emisiones por IP.
- **En modo local sin `INGESTA_TOKEN` la ingesta queda abierta**, para desarrollar. En
  modo supabase siempre hace falta llave. El simulador embebido solo existe en modo local.
- Es deliberadamente pequeño: cuando se decida el backend definitivo se cambia por su
  auth sin tocar las pantallas.

## Panel de reporteros

`/reportero`. Pantalla oscura y mínima, pensada para cuatro horas en la mano a pleno sol.

1. El reportero escribe su código (una vez por día) y toca **Empezar a reportar**.
2. Desde ahí **el GPS sale solo cada 20 s**. No hay que tocar nada.
3. **«Estoy aquí»** manda al instante. Para cuando el desfile se para o vuelve a arrancar.
4. Si el GPS no sirve, se marca **por punto de referencia** (la lista de hitos).

Lo que aguanta: si se cae la red, los puntos se guardan en el celular y salen juntos al
volver la señal; la hora se corrige con el reloj del servidor; y se pide mantener la
pantalla encendida (Wake Lock), porque **con la pantalla bloqueada el navegador deja de
leer el GPS**. Si el navegador no lo permite, el panel lo dice. La pantalla también le
confirma al reportero por dónde cree la app que va («estás por Colegio Champagnat»): si
dice algo raro, lo nota al instante.

**Suplentes.** Conviene un suplente por rol, con su propio código y el panel abierto. No
estorba: mientras el titular manda, el suplente ve «de respaldo» y sus puntos no entran;
si el titular se calla un minuto, el suplente toma el rol solo.

**Necesita HTTPS.** Por `http://` (fuera de `localhost`) el navegador no entrega el GPS; el
panel lo avisa.

## Panel de administración

`/admin`, con `ADMIN_CLAVE`. Cinco pestañas:

- **En vivo**: el desfile actual en un mapa, dónde va cada rol, hace cuánto mandó y quién
  lo reporta. Botones para marcar en curso, finalizar o reiniciar.
  - **Corregir**: poner a mano un rol en el mapa cuando un reportero mandó algo absurdo o
    se quedó sin señal.
  - **Alertas**: si un rol lleva más de 5 min callado con el desfile en curso, sale un
    aviso rojo, suena un pitido y (si se activó) llega una notificación. Solo con el
    panel abierto en algún navegador.
  - **Mensaje para todos**: un texto que sale arriba del mapa de todo el mundo al
    instante («arranca con 40 min de retraso»). Vence solo.
- **Programación**: los desfiles de cada día y los demás eventos. Es lo que alimenta
  «Hoy», «Desfiles» y la capa Tarimas.
- **Reporteros**: crear (genera el código), cambiar de rol, desactivar, regenerar código,
  borrar.
- **Comercios**: alta y edición con la ubicación en el mapa, plan, oferta, menú, WhatsApp
  y enlace; y los servicios (baños, hidratación…). Cada comercio muestra **sus números**:
  cuántos vieron la oferta, abrieron la ficha, vieron el menú o tocaron WhatsApp.
- **Fotos**: la cola de moderación. Nada sale en el muro sin pasar por aquí.

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
   - `.env.local` con `NEXT_PUBLIC_DATOS=supabase`, las tres variables de Supabase y
     `ADMIN_CLAVE`, `SESION_SECRETO` e `INGESTA_TOKEN` (ver `.env.example`).
   - Cargar la senda en la tabla `sendas` y crear la fila del desfile.
   - **Probar el adaptador de Supabase de punta a punta**, que hoy está escrito pero nunca
     ejecutado contra un proyecto real. Hay que dar por hecho que algo falla la primera vez.

**3. Vercel (cuenta tuya).**
   - Importar el repo en Vercel y poner las mismas variables de entorno.
   - `SUPABASE_SERVICE_ROLE_KEY` va solo como variable de servidor. Nunca con prefijo
     `NEXT_PUBLIC_`, que la publicaría al navegador.

### Lo que hay que saber antes de enseñárselo a alguien

- **El simulador embebido (`Modo demo`) no funciona en Vercel**, porque es un `setInterval`
  dentro del proceso. Para mover el desfile en el despliegue se usa el script:
  `INGESTA_TOKEN=… npm run simular -- --url=https://tu-despliegue.vercel.app`.
- **Sigue sin probarse con red mala**, que es el riesgo número uno del proyecto.
- La senda, los hitos, los comercios y la programación siguen siendo **datos de ejemplo**.

## Comercios en el mapa

La capa **Comercios** reúne restaurantes, tascas, cafés, tiendas y droguerías. Cada uno es
un marcador tocable: al tocarlo se abre su ficha abajo, en lugar de la barra de ETA, con
qué es, dónde queda, a cuánto está de vos, a qué hora abre y —si contrató— su oferta, su
menú y su WhatsApp.

Va todo junto en un solo filtro a propósito: para alguien parado en la senda, «dónde como,
dónde compro» es la misma pregunta. El icono distingue de qué tipo es cada sitio; el color
no cambia por categoría porque con ocho colores el mapa se vuelve ilegible justo donde hay
más cosas.

La capa **Servicios** (baños, hidratación, primeros auxilios, policía, cierres) usa el
mismo almacén y formulario, pero solo aparece si el equipo cargó alguno. ⚠️ Solo con datos
oficiales: un baño inventado en un mapa que alguien usa para buscar un baño es peor que no
ofrecer la capa.

### Qué se vende

| | Sin plan | Básico | Destacado |
|---|---|---|---|
| Aparece en el mapa con su ficha | sí | sí | sí |
| Oferta, menú, WhatsApp y enlace en la ficha | — | sí | sí |
| «Oferta cerca» a quien pase a menos de 300 m | — | — | sí |
| Vitrina en la pantalla Hoy (rota cada 30 min) | — | — | sí |

- **Aparecer en el mapa no depende de pagar.** El directorio vale por completo, no por
  pagado.
- **La oferta puede ser por momento**: todo el día, solo antes de que pase el desfile
  frente al comercio, o solo después («2x1 en hervidos cuando pase el desfile»).
- **Lo pagado lleva el sello «PAUTA»**, discreto, junto al botón. Discreto porque no es lo
  primero que importa; presente porque si el usuario no puede distinguir qué es pauta y qué
  no, la confianza que se le vende al anunciante deja de existir — y en Colombia la
  publicidad no identificada es un problema con la SIC, no solo de estilo.
- **El reporte para el anunciante** está en `/admin` → Comercios: contadores de vistas y
  toques. No identifican a nadie y no distinguen si la misma persona abrió la ficha dos
  veces; cualquiera podría inflarlos con un script, así que sirven para mostrar interés,
  no para facturar por clic.

Los comercios se gestionan desde `/admin`. En modo local, `src/data/comercios-ejemplo.json`
es la carga inicial. ⚠️ Los diez del JSON son **inventados**: ningún negocio real ha
contratado nada.

## Avisos, compartir y fotos

- **«Avisame cuando esté cerca».** En la barra del ETA. Con llaves VAPID en el servidor
  (`npm run push:llaves`) el aviso llega aunque la app esté cerrada: cada vez que entra
  una posición de la cabeza se revisa a quién le faltan 10 min o menos, se le notifica y
  su suscripción se borra. Sin llaves, o si el navegador no soporta push, la propia app
  vigila el ETA y avisa, pero solo mientras esté abierta — y lo dice.
- **«Compartir mi punto».** Arma un enlace `/?encuentro=<metros>` con el texto «estoy por
  Cristo Rey, llega en 20–35 min». Quien lo abre ve un pin en ese punto de la senda. Solo
  viaja el metro de la senda, no la posición exacta.
- **Termina de pasar en…** Con la cola reportando, el ETA también dice cuánto falta para
  que el desfile acabe de pasar por donde está el usuario.
- **Fotos.** Cualquiera sube; la foto se reduce en el celular (lo que además borra sus
  metadatos, incluidas las coordenadas), queda **pendiente** y solo sale en el muro cuando
  alguien del equipo la aprueba. Máximo 8 por dispositivo por hora.
- **Por dónde pasó.** En «Desfiles», cada desfile que ya salió muestra a qué hora pasó la
  cabeza por cada punto de referencia.
- **Inglés.** La interfaz está en español e inglés (`src/lib/i18n-textos.ts`); se elige
  solo según el idioma del celular y se puede cambiar. El contenido que carga el equipo
  no se traduce.

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

**«¿Dónde me hago?».** Con la capa encendida y muestra suficiente, sugiere hasta tres
tramos con campo más adelante del desfile, con cuánto falta para que llegue a cada uno.
Solo recomienda tramos que se SABE que están tranquilos; uno sin datos no se sugiere.

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
    hoy/ desfiles/ fotos/ las otras tres pestañas
    privacidad/           qué datos usa la app (borrador)
    reportero/ admin/     los paneles del equipo
    error.tsx not-found.tsx robots.ts manifest.ts
    api/
      posiciones/         ingesta — la única puerta de entrada
      estado/             snapshot + stream SSE del desfile actual
      programacion/       desfiles y eventos (público)
      desfiles/[id]/recorrido/  a qué hora pasó por cada hito
      comercios/          los visibles (público) + contador de métricas
      densidad/ dispositivo/    gentío e id anónimo firmado
      avisos-push/        suscripción a «avisame cuando esté cerca»
      fotos/              subir, listar y servir fotos
      reportero/sesion/   entrar y salir con el código
      admin/              sesión, desfiles, eventos, avisos, comercios, reporteros, fotos
      simulacion/         el botón de demo (solo modo local)
      salud/ senda/
  components/
    MapaDesfile.tsx       MapLibre: senda en 3 tramos, marcadores, PDI
    BarraEta.tsx          la hoja blanca: los estados del ETA, aviso y compartir
    Pantalla*.tsx         una por pestaña
    PanelReportero.tsx    el panel de los reporteros
    admin/                el panel de administración, una pestaña por archivo
  lib/
    senda.ts              proyección 1D (Turf)
    eta.ts                velocidad, rangos, detención, sin señal
    desfiles.ts fecha.ts  cuál es el desfile actual; fechas en hora de Pasto
    sesion.ts             quién puede escribir: cookies firmadas, códigos, frenos
    push.ts recorrido.ts  avisos de cercanía; paso por cada hito
    i18n-textos.ts        español e inglés
    datos/                adaptador local + Supabase (modo.ts: lo que ve el cliente)
    *.test.ts             pruebas (npm test)
  data/                   datos de ejemplo y estilo del mapa
scripts/                  simular, generar estilo/íconos/llaves, copiar worker
supabase/schema.sql
public/sw.js              service worker: sin red, mapa y avisos push
public/mapa/              teselas de Pasto y fuentes de las etiquetas
```
