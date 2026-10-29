#!/usr/bin/env -S npx tsx

import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";

/**
 * npm runs scripts through cmd.exe on Windows, where `bash` on PATH is
 * usually WSL's System32\bash.exe rather than Git Bash. Locate the Git Bash
 * that ships with Git for Windows via `git --exec-path`
 * (<git>/mingw64/libexec/git-core).
 */
function bashPath(): string {
  if (process.platform !== "win32") return "bash";
  const execPath = execFileSync("git", ["--exec-path"], {
    encoding: "utf8",
  }).trim();
  return path.join(execPath, "..", "..", "..", "bin", "bash.exe");
}

const result = spawnSync(bashPath(), process.argv.slice(2), {
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
