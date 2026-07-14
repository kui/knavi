#!/usr/bin/env -S npx tsx

import JSZip from "jszip";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "./build";
import { version } from "./version";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const BUILD = path.join(ROOT, "build");

function addDir(zip: JSZip, dir: string, base: string): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(base, full);
    if (entry.isDirectory()) {
      addDir(zip, full, base);
    } else {
      zip.file(rel, readFileSync(full));
    }
  }
}

async function main(): Promise<void> {
  await build({ minify: true });
  const zip = new JSZip();
  addDir(zip, BUILD, BUILD);
  const content = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  });
  const out = path.join(ROOT, `knavi-${version()}.zip`);
  writeFileSync(out, content);
  console.log(`Wrote ${out}`);
}

await main();
