#!/usr/bin/env -S npx tsx

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isMain } from "./is-main";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function version(): string {
  const pkg = JSON.parse(
    readFileSync(path.join(__dirname, "..", "package.json"), "utf8"),
  ) as { readonly version: string };
  return pkg.version;
}

if (isMain(import.meta.url)) {
  console.log(version());
}
