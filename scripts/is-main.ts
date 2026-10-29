import { pathToFileURL } from "node:url";

/**
 * Whether the module at `moduleUrl` (pass `import.meta.url`) is the script
 * Node was launched with, i.e. it is being run directly rather than imported.
 */
export function isMain(moduleUrl: string): boolean {
  const entry = process.argv[1];
  // WHY: comparing against `file://${entry}` breaks on Windows, where argv[1] is `C:\...` but the URL is `file:///C:/...`.
  return entry !== undefined && moduleUrl === pathToFileURL(entry).href;
}
