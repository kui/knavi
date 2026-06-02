#!/usr/bin/env node

import manifest from "../src/manifest.ts";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import type { Pkg } from "../types/npm.d.ts";
const pkg = JSON.parse(
  readFileSync(path.join(__dirname, "..", "package.json"), "utf8"),
) as Pkg;
console.log(JSON.stringify(manifest(pkg), null, 2));
