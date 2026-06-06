#!/usr/bin/env -S npx tsx

import { readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

rmSync(path.join(ROOT, "build"), { recursive: true, force: true });
for (const file of readdirSync(ROOT)) {
  if (file.endsWith(".zip")) {
    rmSync(path.join(ROOT, file), { force: true });
  }
}
