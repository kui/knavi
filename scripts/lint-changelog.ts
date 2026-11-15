#!/usr/bin/env -S npx tsx

import { readFragments } from "./changelog";

if (import.meta.main) {
  const { errors } = readFragments();
  for (const e of errors) console.error(e);
  if (errors.length > 0) process.exitCode = 1;
}
