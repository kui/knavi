#!/usr/bin/env -S npx tsx

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  DIGEST_PLACEHOLDER,
  ROOT,
  lintFragment,
  listFragmentFiles,
  readFragmentFile,
  versionFile,
} from "./changelog";
import { version } from "./version";

/** Returns an error message, or undefined when the release changelog is fine or not built yet. */
function lintVersionFile(v: string): string | undefined {
  if (!v) return "package.json has no version";
  const file = versionFile(v);
  const absFile = path.join(ROOT, file);
  if (!existsSync(absFile)) return undefined;

  const lines = readFileSync(absFile, "utf8").split("\n");
  if (lines[0] !== `# Version ${v}`) {
    return `${file} does not start with the correct version header`;
  }
  // WHY: the line right after the version header becomes the git tag subject (GitHub release title), so require a non-bullet digest line there whenever bullets exist, or the first bullet becomes the title.
  if (lines[2]?.startsWith("-")) {
    lines.splice(2, 0, DIGEST_PLACEHOLDER, "");
    writeFileSync(absFile, lines.join("\n"));
    return `${file} was missing a digest line; inserted a TODO placeholder`;
  }
  if (lines[2]?.startsWith("TODO:")) {
    return `${file}: replace the TODO digest on line 3 with a one-line summary of the release`;
  }
  return undefined;
}

if (import.meta.main) {
  const errors = [
    ...listFragmentFiles().flatMap((f) => lintFragment(f, readFragmentFile(f))),
    lintVersionFile(version()),
  ].filter((e) => e !== undefined);
  for (const e of errors) console.error(e);
  if (errors.length > 0) process.exitCode = 1;
}
