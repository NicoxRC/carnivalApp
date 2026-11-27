import { positionForApi } from "../src/lib/api/positions";
import { COURSE } from "../src/lib/course";
import { REPORT_INTERVAL_MS, ParadeSimulator } from "../src/lib/simulation/engine";

const LOCAL_URL = "http://localhost:8000";
const LOCAL_EMAIL = "simulator@local";
const LOCAL_PASSWORD = "simulator-dev-only";

interface Options {
  url: string;
  email: string;
  password: string;
  speed: number;
  intervalS: number;
  gap: number;
  stops: boolean;
  start: number;
}

function isLocal(url: string): boolean {
  try {
    return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

function parseArgs(argv: string[]): Options {
  const args = new Map<string, string>();
  for (const arg of argv) {
    const m = /^--([a-zA-Z-]+)(?:=(.*))?$/.exec(arg);
    if (m) args.set(m[1], m[2] ?? "true");
  }

  const num = (key: string, fallback: number) => {
    const v = args.get(key);
    if (v === undefined) return fallback;
    const n = Number(v);
    if (!Number.isFinite(n)) {
      console.error(`Invalid value for --${key}: "${v}"`);
      process.exit(1);
    }
    return n;
  };

  const url = (args.get("url") ?? LOCAL_URL).replace(/\/+$/, "");
  const email = args.get("email") ?? process.env.SIMULATOR_EMAIL;
  const password = args.get("password") ?? process.env.SIMULATOR_PASSWORD;
  if ((!email || !password) && !isLocal(url)) {
    console.error(`Against ${url} a real account is needed: --email=… --password=… (or SIMULATOR_EMAIL and SIMULATOR_PASSWORD).`);
    process.exit(1);
  }

  return {
    url,
    email: email ?? LOCAL_EMAIL,
    password: password ?? LOCAL_PASSWORD,
    speed: num("speed", 1.5),
    intervalS: num("interval", REPORT_INTERVAL_MS / 1000),
    gap: num("gap", 550),
    stops: args.get("stops") !== "false",
    start: num("start", 0),
  };
}

const opts = parseArgs(process.argv.slice(2));

const sim = new ParadeSimulator({
  speedKmh: opts.speed,
  gapM: opts.gap,
  stops: opts.stops,
  startM: opts.start,
});

const endpoint = `${opts.url}/api/positions`;
let token: string | null = null;
let sent = 0;
let failed = 0;
let running = true;

console.log(`
Sigue el Desfile — simulator
  course   : ${COURSE.name} (${(COURSE.lengthMetres / 1000).toFixed(2)} km)
  target   : ${endpoint} (the current parade)
  user     : ${opts.email}
  speed    : ${opts.speed} km/h
  interval : ${opts.intervalS} s
  gap      : ${opts.gap} m between head, middle and tail
  stops    : ${opts.stops ? "yes" : "no"}

Ctrl+C to stop.
`);

async function messageOf(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  try {
    const body = JSON.parse(text) as { error?: unknown };
    if (typeof body.error === "string") return body.error;
  } catch {}
  return text.slice(0, 160);
}

async function logIn(): Promise<void> {
  const res = await fetch(`${opts.url}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: opts.email, password: opts.password }),
  });
  if (!res.ok) {
    console.error(`  ✗ could not log in as ${opts.email}: ${res.status} ${await messageOf(res)}`);
    if (opts.email === LOCAL_EMAIL) console.error("    Did you run `just seed`? It creates that user in the local database.");
    process.exit(1);
  }
  token = ((await res.json()) as { token: string }).token;
}

function post(body: string): Promise<Response> {
  return fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body,
  });
}

async function send() {
  const body = JSON.stringify(sim.advance(opts.intervalS, "current").map(positionForApi));

  try {
    if (!token) await logIn();
    let res = await post(body);
    if (res.status === 401) {
      await logIn();
      res = await post(body);
    }

    if (!res.ok) {
      failed++;
      console.error(`  ✗ ${res.status} ${await messageOf(res)}`);
      if (res.status === 401 || res.status === 403) {
        console.error(`    ${opts.email} cannot send positions: it needs the ingest role.`);
        process.exit(1);
      }
      return;
    }
    sent++;
  } catch (e) {
    failed++;
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`  ✗ no answer from ${opts.url}: is the backend running (\`just dev\`)? (${msg})`);
    return;
  }

  const km = (sim.advanceM / 1000).toFixed(2);
  const total = (COURSE.lengthMetres / 1000).toFixed(2);
  const pct = Math.round((sim.advanceM / COURSE.lengthMetres) * 100);
  console.log(
    `  ✓ ${new Date().toLocaleTimeString("en-GB")} · head ${km}/${total} km (${pct}%)${
      sim.isStopped ? " · STOPPED" : ""
    }`,
  );

  if (sim.finished) {
    console.log(`\nThe parade reached the end of the course. Sent: ${sent}, failed: ${failed}.`);
    running = false;
  }
}

async function loop() {
  while (running) {
    await send();
    if (!running) break;
    await new Promise((r) => setTimeout(r, opts.intervalS * 1000));
  }
  process.exit(0);
}

process.on("SIGINT", () => {
  running = false;
  console.log(`\nStopped. Sent: ${sent}, failed: ${failed}.`);
  process.exit(0);
});

void loop();
