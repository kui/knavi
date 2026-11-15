import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.join(__dirname, "..");
export const FRAGMENT_DIR = "changelog/unreleased";
export const DIGEST_PLACEHOLDER = "TODO: write a one-line release digest";

/** Fragment types in the order their sections appear in a release changelog. */
export const FRAGMENT_TYPES = [
  { type: "add", heading: "Add" },
  { type: "change", heading: "Change" },
  { type: "fix", heading: "Fix" },
  { type: "perf", heading: "Performance" },
] as const;

export type FragmentType = (typeof FRAGMENT_TYPES)[number]["type"];

export interface Fragment {
  readonly fileName: string;
  readonly type: FragmentType;
  readonly body: string;
}

const FRAGMENT_NAME = /^[a-z0-9][a-z0-9-]*\.([a-z]+)\.md$/;
const FORMAT_HINT = `Name fragments ${FRAGMENT_DIR}/<slug>.<${FRAGMENT_TYPES.map((t) => t.type).join("|")}>.md (e.g. 121-barrier-keys.fix.md) and write one "- " bullet; see ${FRAGMENT_DIR}/README.md`;

export function versionFile(version: string): string {
  return `changelog/${version}.md`;
}

/** Returns the errors in one fragment; empty when it is valid. */
export function lintFragment(fileName: string, content: string): string[] {
  const where = `${FRAGMENT_DIR}/${fileName}`;
  const type = FRAGMENT_NAME.exec(fileName)?.[1];
  if (!type || !FRAGMENT_TYPES.some((t) => t.type === type)) {
    return [`${where}: invalid file name. ${FORMAT_HINT}`];
  }
  const lines = content.trimEnd().split("\n");
  if (!lines[0]?.startsWith("- ")) {
    return [`${where}: must start with "- ". ${FORMAT_HINT}`];
  }
  // WHY: an unindented line would end the bullet, so the fragment would no longer nest under its section heading.
  if (lines.slice(1).some((l) => l !== "" && !l.startsWith(" "))) {
    return [
      `${where}: must be a single bullet; indent continuation lines and sub-bullets. ${FORMAT_HINT}`,
    ];
  }
  return [];
}

export function parseFragment(fileName: string, content: string): Fragment {
  const errors = lintFragment(fileName, content);
  if (errors.length > 0) throw new Error(errors.join("\n"));
  const type = FRAGMENT_NAME.exec(fileName)?.[1] as FragmentType;
  return { fileName, type, body: content.trimEnd() };
}

/** Lists fragment file names in the order they are rendered. */
export function listFragmentFiles(root = ROOT): string[] {
  const dir = path.join(root, FRAGMENT_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f !== "README.md")
    .sort();
}

export function readFragmentFile(fileName: string, root = ROOT): string {
  return readFileSync(path.join(root, FRAGMENT_DIR, fileName), "utf8");
}

export function renderChangelog(
  version: string,
  fragments: readonly Fragment[],
): string {
  const sections = FRAGMENT_TYPES.flatMap(({ type, heading }) => {
    const bodies = fragments
      .filter((f) => f.type === type)
      .sort((a, b) => (a.fileName < b.fileName ? -1 : 1))
      .map((f) => indent(f.body));
    return bodies.length > 0 ? [[`- ${heading}`, ...bodies].join("\n")] : [];
  });
  return [`# Version ${version}`, DIGEST_PLACEHOLDER, ...sections]
    .join("\n\n")
    .concat("\n");
}

function indent(body: string): string {
  return body
    .split("\n")
    .map((l) => (l === "" ? l : `  ${l}`))
    .join("\n");
}
