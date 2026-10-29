#!/usr/bin/env -S npx tsx

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { version } from "./version";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

/** Returns an error message, or undefined when the changelog is fine. */
function lintChangelog(v: string): string | undefined {
  if (!v) return "package.json has no version";
  const file = `changelog/${v}.md`;
  const absFile = path.join(ROOT, file);
  if (!existsSync(absFile)) {
    writeFileSync(absFile, `# Version ${v}\n`);
    return `${file} did not exist; created it`;
  }

  const content = readFileSync(absFile, "utf8");
  // WHY: keep the checkout's line endings (CRLF under core.autocrlf on Windows) when rewriting.
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const lines = content.split(/\r?\n/);
  if (lines[0] !== `# Version ${v}`) {
    return `${file} does not start with the correct version header`;
  }
  // WHY: the line right after the version header becomes the git tag subject (GitHub release title), so require a non-bullet digest line there whenever bullets exist, or the first bullet becomes the title.
  if (lines[2]?.startsWith("-")) {
    lines.splice(2, 0, "TODO: write a one-line release digest", "");
    writeFileSync(absFile, lines.join(eol));
    return `${file} was missing a digest line; inserted a TODO placeholder`;
  }
  return undefined;
}

if (import.meta.main) {
  const error = lintChangelog(version());
  if (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
