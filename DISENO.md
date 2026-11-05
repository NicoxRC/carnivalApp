# Sigue el Desfile — contexto para el diseño gráfico

> **SUPERADO.** Este era el brief que se mandó a diseño. El diseño ya volvió y está
> implementado: tema claro de papel, Alfa Slab One, voz pastuso y 4 pestañas. Se conserva
> porque documenta el porqué de cada restricción y la autocrítica que originó el rediseño.
> Para el estado actual, ver el README (sección «El diseño aplicado»).

Documento para llevar a una herramienta de diseño y volver con pantallas.
Todo lo que aparece aquí está sacado del código que ya funciona, no inventado:
los textos son literales, los colores son los tokens reales y los estados son los
que la app puede mostrar hoy.

---

## 1. Qué es, en una frase

Estoy parado en una acera de Pasto durante el desfile. Abro la app y en menos de
**3 segundos** sé **cuánto falta para que el desfile llegue a donde estoy**.

Todo lo demás es secundario. Si un elemento de la pantalla no ayuda a responder eso
más rápido, está compitiendo con lo único que importa.

---

## 2. El contexto de uso real (esto debería mandar en el diseño)

No es una app de escritorio ni de sofá. Las condiciones son hostiles y todas juntas:

- **A pleno sol**, entre 9 de la mañana y 5 de la tarde. Contraste alto, brillo de
  pantalla al máximo.
- **Con una sola mano.** La otra lleva un niño, una cerveza, una espuma o un celular
  grabando. Todo lo tocable tiene que estar en el tercio inferior.
- **De pie, en medio de una multitud**, empujado. Nada de gestos finos ni objetivos
  pequeños.
- **Batería al 30 %** a media tarde, porque llevan horas grabando.
- **Red saturada.** Miles de personas en pocas cuadras. La app tiene que verse útil
  aunque el dato tenga 2 minutos de viejo.
- **Usuario primerizo.** La app se usa 6 días al año: nadie recuerda cómo funcionaba.
  No hay aprendizaje acumulado entre usos. Cero tolerancia a interfaces que hay que
  descifrar.
- **Mucha gente mayor y turistas.** No es un público de early adopters.

Consecuencia directa: tipografía grande, contraste alto, una sola idea por pantalla,
y el dato principal legible a un brazo de distancia.

---

## 3. Pantallas

### Hechas (Fase 1)

| Ruta | Qué es |
|---|---|
| `/` | Mapa a pantalla completa + barra de ETA fija abajo. Es la app. |
| `/hoy` | Programación del día en lista cronológica con distancias. |

Navegación: barra inferior de 2 pestañas (Mapa · Hoy).

### Por diseñar (Fase 2 y 3, todavía sin una sola línea de UI)

| Ruta | Qué es | Nota de diseño |
|---|---|---|
| `/reportero` | Panel privado de los 3 reporteros | Pantalla oscura y mínima: la llevan 4 h con la pantalla encendida. Un botón enorme de iniciar/detener y un contador de "último envío hace X s". Diseñar para batería, no para lucirse. |
| `/fotos` | Muro de fotos del público | Grid, cada foto marcada con el punto de la senda donde se tomó. |
| `/admin` | Panel interno | Estado de los 3 reporteros, moderación de fotos, crear eventos. No lo ve el público. |
| — | Promociones geolocalizadas | Fase 3. Tiene que verse claramente como publicidad. |

---

## 4. El elemento central: la barra de ETA

Es la barra fija de abajo. **Es el producto.** Tiene 7 estados distintos y todos se
ven en la vida real. El diseño tiene que resolverlos todos, no solo el bonito.

Los textos son literales del código.

| # | Estado | Titular | Línea de apoyo |
|---|---|---|---|
| 1 | **Llegando** (el caso normal) | `El desfile llega a donde estás en` **`20–35 min`** | `La cabeza va a 2,1 km, a 1,5 km/h` |
| 2 | **Llegando, sin velocidad medida** (primeros 90 s) | igual que el 1 | `La cabeza va a 2,1 km, a ritmo estimado (1,2 km/h)` |
| 3 | **Llegando pero atascado** | igual que el 1 | `La cabeza va a 2,1 km, a 0,8 km/h · sin avanzar hace 4 min` (el sufijo en amarillo) |
| 4 | **Detenido** (>10 min) | **`El desfile está detenido`** (rojo) `— lleva 12 min sin avanzar` | `La cabeza está a 1,4 km de donde estás` |
| 5 | **Encima** (a <120 m) | `El desfile está pasando por donde estás` (naranja) | `Estás a 80 m de la cabeza` |
| 6a | **Ya pasó la cabeza** | `La cabeza ya pasó` `— la cola va a 470 m` | `La cabeza está 620 m más adelante` |
| 6b | **Ya pasó todo** | `El desfile ya pasó por donde estás` | `La cabeza está 1,5 km más adelante` |
| 7a | **Sin ubicación** | `¿Dónde estás parado?` | `Sin tu ubicación no se puede calcular cuánto falta.` + 2 botones |
| 7b | **Lejos de la senda** (>600 m) | `Estás lejos de la senda` | `Acércate a la senda o marca a mano dónde vas a esperarlo.` + 2 botones |
| 7c | **Sin reportes** | `El desfile todavía no ha arrancado` | `Ningún reportero ha enviado posición todavía.` |

Los dos botones de los estados 7 son: **`Usar mi ubicación`** (primario) y
**`Marcar en el mapa`** (secundario).

### Pie de la barra (siempre visible)

Una línea de metadatos, hoy a 11 px:

`● en vivo · último dato hace 2 min (10:52 a. m.) · cabeza por Av. Los Estudiantes con Calle 22`

El punto de color indica la conexión:

| Estado | Texto | Color actual |
|---|---|---|
| `conectando` | `conectando…` | gris |
| `en_vivo` | `en vivo` | verde `#3ddc97` |
| `reintentando` | `reconectando…` | amarillo `#ffc61a` |
| `sin_conexion` | `sin conexión` | rojo `#ff4d6a` |

**Regla dura:** nunca un spinner infinito. Si no hay red, se muestra el último dato
conocido **con su hora**. Un dato viejo etiquetado es infinitamente mejor que una
rueda girando.

---

## 5. El mapa

- Ocupa toda la pantalla; el resto flota encima.
- La senda es una línea con tres tramos de color, y esto es lo que más rápido comunica:
  - **gris `#4b4b57`** — por donde el desfile ya pasó
  - **naranja `#ff6a1f`** — el cuerpo del desfile ahora mismo (de la cola a la cabeza)
  - **blanco `#f7f7f5`** — lo que falta, donde la gente está esperando
- Tres marcadores redondos, hoy etiquetados **1 / 2 / 3**:
  - **Cabeza** — naranja, 34 px (el más grande, es el que importa)
  - **Mitad** — amarillo, 26 px
  - **Cola** — morado, 26 px
- **Mi ubicación** — punto azul `#2f9bff` de 20 px con halo.
- Un reportero que lleva >5 min sin reportar **no se borra**: su marcador se apaga
  (opacidad 42 % + escala de grises). Su última posición sigue siendo información.
- El mapa base va desaturado y oscurecido a propósito para que la senda salte a la vista.

### Encabezado actual

Tarjeta flotante arriba con el nombre del desfile y la leyenda de los tres roles con
su última señal: `Cabeza · hace 23 s`, `Mitad · sin señal`, `Cola · —`.

### Controles flotantes

`Ir a la cabeza` y `Centrar en mí` (o `Ver toda la senda` si no hay ubicación),
como píldoras arriba de la barra de ETA.

---

## 6. Paleta y tipografía actuales (punto de partida, no dogma)

Razonamiento: es el **Carnaval de Negros y Blancos**. La identidad es el blanco y el
negro. El color está reservado para lo único que hay que distinguir de un vistazo —los
tres puntos del desfile y el usuario— y para nada más.

```
Fondo / superficies
  --color-tinta    #0a0a0c   fondo
  --color-tinta-2  #16161b   tarjetas
  --color-tinta-3  #24242c   superficie elevada
  --color-borde    #32323d

Texto
  --color-cal      #f7f7f5   principal
  --color-cal-2    #b9b9c2   secundario
  --color-cal-3    #7c7c88   metadatos

Semánticos
  --color-cabeza   #ff6a1f   cabeza del desfile
  --color-mitad    #ffc61a   mitad
  --color-cola     #a06bff   cola
  --color-usuario  #2f9bff   yo
  --color-alerta   #ff4d6a   detenido / sin conexión
  --color-ok       #3ddc97   en vivo
```

Tipografía: la del sistema. Tamaños actuales: titular del ETA **21,6 px semibold**,
apoyo **13 px**, metadatos **11 px**, leyenda de roles **10 px**.

---

## 7. Lo que NO se puede cambiar (son decisiones de producto, no de estilo)

1. **El ETA se muestra siempre en rangos** de 5 minutos: "20–35 min". Nunca un minuto
   exacto. Un "27 min" que falla quema la credibilidad el único día del año que importa.
2. **Siempre visible la antigüedad del dato.** "hace 2 min" no es un detalle opcional.
3. **Lo patrocinado se marca como patrocinado.** Disfrazarlo de contenido rompe
   justamente la confianza que se le vende al anunciante.
4. **La cabeza es el elemento más prominente** de los tres. Es la que responde la pregunta.
5. **Un reportero sin señal se atenúa, no se borra.**
6. **Todo lo tocable en el tercio inferior**, respetando el área segura de iOS.

---

## 8. Dónde creo que el diseño actual está flojo

Autocrítica de lo que hice. Son los puntos donde más valor tiene una pasada de diseño
de verdad:

1. **La parte de abajo está congestionada.** Compiten cuatro cosas: la barra de ETA, la
   nav de 2 pestañas, los controles flotantes y los avisos. Todo eso vive en el mismo
   tercio inferior. Es el problema de composición más gordo.
2. **El tema oscuro puede ser un error a pleno sol.** Lo elegí por batería y porque el
   mapa resalta, pero los desfiles son de día, al aire libre, y el modo oscuro rinde
   peor bajo luz directa. Vale la pena explorar una versión clara de alto contraste, o
   un tema que cambie según la hora.
3. **Texto de 10–11 px al aire libre es demasiado pequeño.** La línea de metadatos y la
   leyenda de roles probablemente no se leen de pie y al sol.
4. **Los marcadores dicen "1 / 2 / 3"** y eso no se entiende solo. Necesitan una
   solución visual que diga cabeza/mitad/cola sin leyenda.
5. **Cero identidad del Carnaval.** El Carnaval tiene una riqueza visual enorme
   —máscaras, carrozas, papel, color— y la app no usa absolutamente nada. Es correcta
   y anónima. Aquí hay mucho por ganar, siempre que no estorbe la legibilidad.
6. **No hay primer uso.** El usuario primerizo cae directo en el mapa sin que nada le
   explique qué son los tres puntos ni por qué le piden la ubicación.
7. **La franja amarilla del trazado provisional** es ruido permanente. Desaparecerá
   cuando llegue la senda oficial, pero mientras tanto hay que ubicarla mejor.
8. **El panel "Modo demo" es chrome de desarrollo** metido dentro de la UI del producto.
   No debería existir en la pantalla que ve el público.
9. **En `/hoy` falta jerarquía.** Lo que está pasando *ahora* debería dominar la
   pantalla; hoy solo tiene un borde naranja y una etiqueta pequeña.

---

## 9. Restricciones técnicas que condicionan el diseño

- **PWA instalable**, no app nativa. Sin barra del navegador cuando se instala, pero sí
  notch y barra de gestos: hay que respetar `safe-area-inset`.
- **Mobile first, vertical.** El objetivo es 375 × 812. No hay diseño de escritorio y
  no hace falta.
- El mapa es **MapLibre**: los marcadores son HTML normal, así que pueden ser cualquier
  cosa. La línea de la senda se dibuja en WebGL y admite color por tramo, no texturas.
- La app tiene que **abrir sin red** (service worker). Nada de recursos gráficos pesados
  que solo carguen online; si hay ilustraciones, tienen que caber en la caché.
- Los íconos hoy son SVG. **Faltan PNG de 192 y 512 px** para el ícono de pantalla de
  inicio de iOS.

---

## 10. Entregable que me sirve de vuelta

Para montarlo rápido, lo más útil es:

1. Los **7 estados de la barra de ETA** resueltos, no solo el feliz.
2. La **composición del tercio inferior** con todo conviviendo (ETA + nav + controles).
3. **Tokens de color** finales, con sus valores.
4. **Escala tipográfica** con tamaños concretos.
5. Los **tres marcadores + el del usuario**, incluido el estado apagado.
6. `/hoy`: la tarjeta de evento en sus tres estados (próximo, ahora, ya pasó) y la
   variante patrocinada.

Con eso lo llevo a código directo. Los nombres de los tokens ya existen en
`src/app/globals.css`; si mantienes esos nombres y solo cambias los valores, el
cambio es casi mecánico.
