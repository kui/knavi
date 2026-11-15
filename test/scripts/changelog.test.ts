import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  FRAGMENT_DIR,
  buildChangelog,
  checkRelease,
  parseFragment,
  readFragments,
  renderChangelog,
  type Fragment,
} from "../../scripts/changelog";

function fragment(fileName: string, content: string): Fragment {
  const parsed = parseFragment(fileName, content);
  if (typeof parsed === "string") throw new Error(parsed);
  return parsed;
}

function errorOf(fileName: string, content: string): string {
  const parsed = parseFragment(fileName, content);
  if (typeof parsed !== "string") throw new Error(`${fileName} parsed`);
  return parsed;
}

void describe("parseFragment", () => {
  void it("accepts a single bullet with indented continuation lines", () => {
    assert.deepStrictEqual(
      parseFragment("121-barrier-keys.fix.md", "- Fix a bug.\n  More.\n"),
      {
        fileName: "121-barrier-keys.fix.md",
        type: "fix",
        body: "- Fix a bug.\n  More.",
      },
    );
  });

  void it("rejects an unknown type or a malformed name", () => {
    for (const name of ["a.bugfix.md", "a.md", "A.fix.md", "a.fix.txt"]) {
      assert.match(errorOf(name, "- x\n"), /invalid file name/);
    }
  });

  void it("rejects a body that is not one bullet", () => {
    assert.match(errorOf("a.fix.md", "Fix x\n"), /start with/);
    assert.match(errorOf("a.fix.md", "- one\n- two\n"), /single bullet/);
    assert.match(errorOf("a.fix.md", "- one\n\n## Heading\n"), /single bullet/);
  });
});

void describe("renderChangelog", () => {
  void it("groups fragments by type in section order and file-name order", () => {
    const fragments = [
      fragment("b.fix.md", "- Fix b.\n  Detail.\n"),
      fragment("x.perf.md", "- Faster x.\n"),
      fragment("a.fix.md", "- Fix a.\n  - Sub.\n"),
      fragment("n.add.md", "- Add n.\n"),
    ];
    assert.strictEqual(
      renderChangelog("1.2.3", fragments),
      [
        "# Version 1.2.3",
        "",
        "TODO: write a one-line release digest",
        "",
        "- Add",
        "  - Add n.",
        "",
        "- Fix",
        "  - Fix a.",
        "    - Sub.",
        "  - Fix b.",
        "    Detail.",
        "",
        "- Performance",
        "  - Faster x.",
        "",
      ].join("\n"),
    );
  });
});

void describe("with a temporary repository", () => {
  let root: string;
  const write = (file: string, content: string) => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  };
  const fragmentFiles = () => readdirSync(path.join(root, FRAGMENT_DIR)).sort();

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "knavi-changelog-"));
    write(`${FRAGMENT_DIR}/README.md`, "# Changelog fragments\n");
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  void describe("readFragments", () => {
    void it("reports a directory and a malformed fragment", () => {
      mkdirSync(path.join(root, FRAGMENT_DIR, "sub.fix.md"));
      write(`${FRAGMENT_DIR}/ok.fix.md`, "- ok\n");
      write(`${FRAGMENT_DIR}/bad.fix.md`, "bad\n");
      const { fragments, errors } = readFragments(root);
      assert.deepStrictEqual(
        fragments.map((f) => f.fileName),
        ["ok.fix.md"],
      );
      assert.strictEqual(errors.length, 2);
    });
  });

  void describe("buildChangelog", () => {
    void it("writes the version file and deletes the fragments", () => {
      write(`${FRAGMENT_DIR}/a.fix.md`, "- Fix a.\n");
      assert.strictEqual(buildChangelog("1.0.0", root), "changelog/1.0.0.md");
      assert.match(
        readFileSync(path.join(root, "changelog/1.0.0.md"), "utf8"),
        /- Fix\n {2}- Fix a\.\n/,
      );
      assert.deepStrictEqual(fragmentFiles(), ["README.md"]);
    });

    void it("refuses when the version file exists, keeping fragments", () => {
      write(`${FRAGMENT_DIR}/a.fix.md`, "- Fix a.\n");
      write("changelog/1.0.0.md", "# Version 1.0.0\n");
      assert.throws(() => buildChangelog("1.0.0", root), /already exists/);
      assert.deepStrictEqual(fragmentFiles(), ["README.md", "a.fix.md"]);
    });

    void it("refuses without fragments or with a malformed one", () => {
      assert.throws(() => buildChangelog("1.0.0", root), /no fragments/);
      write(`${FRAGMENT_DIR}/bad.fix.md`, "bad\n");
      assert.throws(() => buildChangelog("1.0.0", root), /must start with/);
      assert.ok(!existsSync(path.join(root, "changelog/1.0.0.md")));
    });
  });

  void describe("checkRelease", () => {
    const release = (digest: string) =>
      write("changelog/1.0.0.md", `# Version 1.0.0\n\n${digest}\n\n- Fix\n`);

    void it("accepts a written digest with no fragments left", () => {
      release("Fix things.");
      assert.deepStrictEqual(checkRelease("1.0.0", root), []);
    });

    void it("rejects a missing version file", () => {
      assert.match(checkRelease("1.0.0", root)[0] ?? "", /does not exist/);
    });

    void it("rejects a placeholder, empty, blank or list-like digest", () => {
      for (const digest of [
        "TODO: write a one-line release digest",
        "",
        "  ",
        "- Fix",
        "* Fix",
        "  - Fix",
        "# Fix",
      ]) {
        release(digest);
        assert.match(
          checkRelease("1.0.0", root).join("\n"),
          /digest on line 3/,
          JSON.stringify(digest),
        );
      }
    });

    void it("rejects a wrong header", () => {
      write("changelog/1.0.0.md", "# Version 0.9.0\n\nFix things.\n");
      assert.match(checkRelease("1.0.0", root).join("\n"), /line 1/);
    });

    void it("rejects leftover fragments or entries", () => {
      release("Fix things.");
      mkdirSync(path.join(root, FRAGMENT_DIR, "sub"));
      assert.match(checkRelease("1.0.0", root).join("\n"), /not built into/);
    });
  });
});
