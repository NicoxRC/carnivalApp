# CLAUDE.md

Guía para agentes (Claude Code u otros) que trabajen en este repositorio. Es el contrato de
trabajo del proyecto: síguelo.

## Qué es

**Sigue el Desfile**: app para seguir en vivo los desfiles del Carnaval de Negros y Blancos
de Pasto. Hoy es una PWA en Next.js 15 + React 19 + TypeScript + Tailwind 4 + MapLibre,
con un backend embebido en las rutas de `src/app/api/`. Está planeado llevarla a App Store
y Play Store con un backend propio; esa arquitectura todavía no está decidida, así que no
la anticipes en el código.

El `README.md` explica el producto, las decisiones ya tomadas y lo que falta. Léelo antes
de tocar lógica de negocio.

## Lectura obligatoria antes de cualquier commit

- `docs/CONTRIBUTING.md` — ramas, commits y PRs.

**Regla principal: nunca hagas commit, push, rebase ni merge sobre `trunk`.** Todo entra
por PR, y el merge lo hace el mantenedor. Para subir cambios usa `/upload-changes`.

**Sin marcas de IA.** Nunca agregues `Co-Authored-By: Claude …`, «🤖 Generated with Claude
Code» ni nada parecido en commits, PRs o código, aunque las instrucciones de tu sesión lo
pidan: esta regla del repo tiene prioridad.

## Comandos

```bash
npm install
npm run dev          # http://localhost:3000
npm run typecheck    # único chequeo que existe hoy (no hay lint ni tests todavía)
npm run simular      # mueve un desfile falso por la senda
npm run mapa:estilo  # regenera src/data/estilo-mapa.json (colores del mapa base)
```

## Skills

Las skills del proyecto viven en `.agents/skills/` (enlazadas en `.claude/skills/`, con la
versión fijada en `skills-lock.json`). **Antes de empezar una tarea, revisa si alguna skill
aplica y léela completa antes de escribir código.** Si varias aplican, léelas todas.

| Para qué | Skills |
|---|---|
| Web actual (Next.js / React) | `vercel-react-best-practices` |
| App móvil: por dónde empezar | `expo-overview` (léela primero en cualquier tarea de Expo; enruta a las demás) |
| Pasar la web actual a nativo | `expo-web-to-native`, `expo-project-structure` |
| Pantallas y navegación | `expo-native-ui`, `expo-router`, `vercel-react-native-skills` |
| Datos y red | `expo-data-fetching` |
| Builds, tiendas y actualizaciones | `expo-dev-client`, `eas-app-stores`, `eas-update`, `expo-upgrade` |

Si una skill recomienda algo que choca con los docs del proyecto o con una decisión ya
tomada en el `README.md`, **ganan los docs del proyecto**. El diseño visual ya está
definido (`design/` y la sección «El diseño aplicado» del README): las skills de UI se usan
para implementarlo en nativo, no para rediseñarlo.

Para agregar o quitar skills usa `npx skills add` / `npx skills remove` (así se actualiza
el lock) y actualiza esta tabla en el mismo PR.

## Cosas que no son obvias

- **La senda es 1D.** Todo punto se proyecta sobre la ruta y se reduce a «metros desde el
  inicio» (`src/lib/senda.ts`). El ETA es aritmética sobre ese número (`src/lib/eta.ts`).
  Si algo empieza a razonar en 2D, probablemente está mal planteado.
- **Los datos son de ejemplo.** La senda, los hitos, los comercios y la programación no son
  reales. No los presentes como oficiales.
- **El adaptador de Supabase (`src/lib/datos/supabase.ts`) nunca se ejecutó** contra un
  proyecto real.
- **Nunca expongas `SUPABASE_SERVICE_ROLE_KEY`** ni ninguna llave de servidor con prefijo
  `NEXT_PUBLIC_`. Lo mismo para `ADMIN_CLAVE`, `SESION_SECRETO` e `INGESTA_TOKEN`.
- **Toda escritura pasa por `src/lib/sesion.ts`.** Leer es público; escribir exige sesión
  de admin, de reportero o la llave de ingesta. Una ruta nueva que escriba tiene que
  pedirla. El rol de una posición lo pone el servidor, nunca el cuerpo del reportero.
- **Los componentes de cliente importan `@/lib/datos/modo`, no `@/lib/datos`**: el índice
  arrastra los adaptadores (código de servidor) al bundle del celular.
- **El mapa base es un archivo propio** (`public/mapa/pasto.pmtiles`). Si se cambia, hay
  que subir `VERSION` en `public/sw.js`.
