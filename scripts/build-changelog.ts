#!/usr/bin/env -S npx tsx

import { buildChangelog } from "./changelog";
import { version } from "./version";

if (import.meta.main) {
  try {
    const file = buildChangelog(version());
    console.log(
      `Wrote ${file}. Replace the TODO digest on line 3, and reorder entries within a section if needed.`,
    );
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  }
}
