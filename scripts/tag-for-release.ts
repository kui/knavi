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
export function tagMessage(v: string, root = ROOT): string {
  const lines = readFileSync(path.join(root, versionFile(v)), "utf8").split(
    "\n",
  );
  return lines.slice(2).join("\n");
}

/** Runs `git tag -a <version> -F -` with the message on stdin; returns its exit code. */
function gitTag(v: string, message: string): number {
  const result = spawnSync("git", ["tag", "-a", v, "-F", "-"], {
    cwd: ROOT,
    input: message,
    stdio: ["pipe", "inherit", "inherit"],
  });
  if (result.error) console.error(result.error.message);
  return result.status ?? 1;
}

/** Checks the release and creates the tag. Returns the process exit code. */
export function tagForRelease(v: string, root = ROOT, tag = gitTag): number {
  const errors = checkRelease(v, root);
  for (const e of errors) console.error(e);
  if (errors.length > 0) return 1;
  const message = tagMessage(v, root);
  const status = tag(v, message);
  if (status === 0) console.log(`Created tag ${v}:\n${message}`);
  return status;
}

if (import.meta.main) {
  process.exitCode = tagForRelease(version());
}
