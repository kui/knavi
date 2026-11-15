#!/usr/bin/env -S npx tsx

import { lintFragment, listFragmentFiles, readFragmentFile } from "./changelog";

if (import.meta.main) {
  const errors = listFragmentFiles().flatMap((f) =>
    lintFragment(f, readFragmentFile(f)),
  );
  for (const e of errors) console.error(e);
  if (errors.length > 0) process.exitCode = 1;
}
