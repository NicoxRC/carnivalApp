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

# src/lib/eta.ts · VELOCIDAD_MINIMA_MS
# Parades stop a lot. Without this floor the ETA shoots off to infinity.
MIN_SPEED_MS = 0.3 / 3.6

# src/lib/eta.ts · VELOCIDAD_NOMINAL_MS
# What is assumed until there is enough history to measure: 1.2 km/h. An
# honest constant is better than a measured number that measures nothing.
NOMINAL_SPEED_MS = 1.2 / 3.6

# src/lib/eta.ts · VENTANA_MINIMA_CONFIABLE_S
# Below this window the measured speed is not trusted.
MIN_RELIABLE_WINDOW_S = 90

# src/lib/eta.ts · VELOCIDAD_MAXIMA_MS
# Above 6 km/h it is a GPS jump or a reporter who reappeared somewhere else,
# not a fast parade: the measurement is thrown away.
MAX_SPEED_MS = 6 / 3.6

# src/lib/tipos.ts · MS_VENTANA_VELOCIDAD
# The window averaged to estimate the speed of the head.
SPEED_WINDOW = timedelta(minutes=10)

# src/lib/tipos.ts · AVANCE_MINIMO_M
# Without advancing more than this during `STOPPED_AFTER`, it is stopped.
MIN_PROGRESS_M = 25

# src/lib/tipos.ts · DETENIDO_MS
# The hard threshold: only here is "the parade is stopped" said.
STOPPED_AFTER = timedelta(minutes=10)
