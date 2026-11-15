import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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

/** Returns the parsed fragment, or an error message when it is malformed. */
export function parseFragment(
  fileName: string,
  content: string,
): Fragment | string {
  const where = `${FRAGMENT_DIR}/${fileName}`;
  const name = FRAGMENT_NAME.exec(fileName)?.[1];
  const type = FRAGMENT_TYPES.find((t) => t.type === name)?.type;
  if (!type) return `${where}: invalid file name. ${FORMAT_HINT}`;
  const body = content.trimEnd();
  const lines = body.split("\n");
  if (!lines[0]?.startsWith("- ")) {
    return `${where}: must start with "- ". ${FORMAT_HINT}`;
  }
  // WHY: an unindented line would end the bullet, so the fragment would no longer nest under its section heading.
  if (lines.slice(1).some((l) => l !== "" && !l.startsWith(" "))) {
    return `${where}: must be a single bullet; indent continuation lines and sub-bullets. ${FORMAT_HINT}`;
  }
  return { fileName, type, body };
}

/** Reads every entry of the fragment directory except its README. */
export function readFragments(root = ROOT): {
  fragments: Fragment[];
  errors: string[];
} {
  const dir = path.join(root, FRAGMENT_DIR);
  const fragments: Fragment[] = [];
  const errors: string[] = [];
  if (!existsSync(dir)) return { fragments, errors };
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "README.md") continue;
    if (!entry.isFile()) {
      errors.push(`${FRAGMENT_DIR}/${entry.name}: not a file. ${FORMAT_HINT}`);
      continue;
    }
    const parsed = parseFragment(
      entry.name,
      readFileSync(path.join(dir, entry.name), "utf8"),
    );
    if (typeof parsed === "string") errors.push(parsed);
    else fragments.push(parsed);
  }
  return { fragments, errors };
}

/** Sections follow FRAGMENT_TYPES; entries within a section follow file name. */
export function renderChangelog(
  version: string,
  fragments: readonly Fragment[],
): string {
  const sorted = [...fragments].sort((a, b) =>
    a.fileName.localeCompare(b.fileName, "en"),
  );
  const sections = FRAGMENT_TYPES.flatMap(({ type, heading }) => {
    const bodies = sorted
      .filter((f) => f.type === type)
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

/** Writes the release changelog from the fragments and deletes them; returns its path. */
export function buildChangelog(version: string, root = ROOT): string {
  const file = versionFile(version);
  const absFile = path.join(root, file);
  if (existsSync(absFile)) {
    throw new Error(`${file} already exists; remove it to rebuild`);
  }
  const { fragments, errors } = readFragments(root);
  if (errors.length > 0) throw new Error(errors.join("\n"));
  if (fragments.length === 0) {
    throw new Error(`${FRAGMENT_DIR} has no fragments`);
  }
  writeFileSync(absFile, renderChangelog(version, fragments));
  for (const f of fragments) rmSync(path.join(root, FRAGMENT_DIR, f.fileName));
  return file;
}

// WHY: the digest becomes the git tag subject and the GitHub release title, so it must be plain prose, not a list item, heading, quote or indented text.
const DIGEST_LINE = /^[^\s\-*+#>]/;

/** Returns why the release cannot be tagged yet; empty when it can. */
export function checkRelease(version: string, root = ROOT): string[] {
  const file = versionFile(version);
  const absFile = path.join(root, file);
  if (!existsSync(absFile)) {
    return [`${file} does not exist; run 'npm run changelog' in a release PR`];
  }
  const errors: string[] = [];
  const lines = readFileSync(absFile, "utf8").split("\n");
  if (lines[0] !== `# Version ${version}`) {
    errors.push(`${file}: line 1 must be "# Version ${version}"`);
  }
  if (lines[1] !== "") errors.push(`${file}: line 2 must be empty`);
  const digest = lines[2] ?? "";
  if (digest.startsWith("TODO:") || !DIGEST_LINE.test(digest)) {
    errors.push(`${file}: write a one-line release digest on line 3`);
  }
  const { fragments, errors: fragmentErrors } = readFragments(root);
  if (fragments.length > 0 || fragmentErrors.length > 0) {
    errors.push(`${FRAGMENT_DIR} has entries not built into ${file}`);
  }
  return errors;
}
