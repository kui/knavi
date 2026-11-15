#!/usr/bin/env -S npx tsx

import { existsSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  FRAGMENT_DIR,
  ROOT,
  listFragmentFiles,
  parseFragment,
  readFragmentFile,
  renderChangelog,
  versionFile,
} from "./changelog";
import { version } from "./version";

function buildChangelog(v: string): string {
  const file = versionFile(v);
  const absFile = path.join(ROOT, file);
  if (existsSync(absFile)) {
    throw new Error(`${file} already exists; remove it to rebuild`);
  }
  const files = listFragmentFiles();
  if (files.length === 0) throw new Error(`${FRAGMENT_DIR} has no fragments`);
  const fragments = files.map((f) => parseFragment(f, readFragmentFile(f)));
  writeFileSync(absFile, renderChangelog(v, fragments));
  for (const f of files) rmSync(path.join(ROOT, FRAGMENT_DIR, f));
  return file;
}

if (import.meta.main) {
  try {
    const file = buildChangelog(version());
    console.log(`Wrote ${file}; replace the TODO digest on line 3`);
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  }
}
