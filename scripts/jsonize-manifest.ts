#!/usr/bin/env node

import manifest from "../src/manifest.ts";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Pkg } from "../types/npm.d.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function jsonizeManifest(): string {
  const pkg = JSON.parse(
    readFileSync(path.join(__dirname, "..", "package.json"), "utf8"),
  ) as Pkg;
  return JSON.stringify(manifest(pkg), null, 2);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(jsonizeManifest());
}
