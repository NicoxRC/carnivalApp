"""Numbers the web and the backend have to agree on.

Each one names the TypeScript file it comes from: if one changes, the other
changes with it.
"""

from datetime import timedelta

# src/lib/densidad.ts · BIN_M
# Size of a stretch. 100 m is about a block: enough to decide where to stand.
BIN_M = 100

# src/lib/densidad.ts · VENTANA_DENSIDAD_MS
# Only whoever reported in the last few minutes counts.
DENSITY_WINDOW = timedelta(minutes=5)

# src/lib/densidad.ts · MIN_USUARIOS_GLOBAL
# Below this the sample stands for nothing and the whole layer is turned off.
# It is the safeguard against "the map says empty where there are five
# thousand people".
MIN_USERS_GLOBAL = 50

# src/lib/densidad.ts · MIN_MUESTRAS_BIN
# And a stretch needs at least this many reports to be classified.
MIN_SAMPLES_BIN = 3

# src/lib/densidad.ts · the thresholds inside `clasificar`
# Share of the fullest stretch from which a stretch is "busy" and "full".
BUSY_FROM = 0.33
FULL_FROM = 0.66

# src/lib/sesion.ts · EMISIONES_POR_IP_HORA
# Generous on purpose: mobile carriers put thousands of phones behind the
# same IP, and a low cap would leave real people out.
DEVICES_PER_IP_PER_HOUR = 300
