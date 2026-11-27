import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { apiBaseFromEnv, cloudflareHeadersFile } from "../security-headers";

const target = resolve(import.meta.dirname, "../out/_headers");
writeFileSync(target, cloudflareHeadersFile(apiBaseFromEnv(false)));
console.log(`✓ ${target}`);
