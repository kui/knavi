#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function version(): string {
  const pkg = JSON.parse(
    readFileSync(path.join(__dirname, "..", "package.json"), "utf8"),
  ) as { readonly version: string };
  return pkg.version;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(version());
}
