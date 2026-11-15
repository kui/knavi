#!/usr/bin/env -S npx tsx

import { checkRelease } from "./changelog";
import { version } from "./version";

if (import.meta.main) {
  const errors = checkRelease(version());
  for (const e of errors) console.error(e);
  if (errors.length > 0) process.exitCode = 1;
}
