#!/usr/bin/env -S npx tsx

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { ROOT, checkRelease, versionFile } from "./changelog";
import { version } from "./version";

/**
 * Returns the tag message: `changelog/<version>.md` without its
 * "# Version X.Y.Z" heading and the blank line below it.
 */
// WHY: the digest line becomes the tag subject and the GitHub release title.
export function tagMessage(v: string, root = ROOT): string {
  const lines = readFileSync(path.join(root, versionFile(v)), "utf8").split(
    "\n",
  );
  return lines.slice(2).join("\n");
}

if (import.meta.main) {
  const v = version();
  const errors = checkRelease(v);
  for (const e of errors) console.error(e);
  if (errors.length > 0) {
    process.exitCode = 1;
  } else {
    const result = spawnSync("git", ["tag", "-a", v, "-F", "-"], {
      cwd: ROOT,
      input: tagMessage(v),
      stdio: ["pipe", "inherit", "inherit"],
    });
    if (result.error) console.error(result.error.message);
    process.exitCode = result.status ?? 1;
  }
}
