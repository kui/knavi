import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  lintFragment,
  parseFragment,
  renderChangelog,
} from "../../scripts/changelog";

void describe("lintFragment", () => {
  void it("accepts a single bullet with indented continuation lines", () => {
    assert.deepStrictEqual(
      lintFragment(
        "121-barrier-keys.fix.md",
        "- Fix a bug.\n  More detail.\n\n  - A sub-bullet.\n",
      ),
      [],
    );
  });

  void it("rejects an unknown type or a malformed name", () => {
    for (const name of ["a.bugfix.md", "a.md", "A.fix.md", "a.fix.txt"]) {
      assert.match(lintFragment(name, "- x\n")[0] ?? "", /invalid file name/);
    }
  });

  void it("rejects a body that is not one bullet", () => {
    assert.match(lintFragment("a.fix.md", "Fix x\n")[0] ?? "", /start with/);
    assert.match(
      lintFragment("a.fix.md", "- one\n- two\n")[0] ?? "",
      /single bullet/,
    );
    assert.match(
      lintFragment("a.fix.md", "- one\n\n## Heading\n")[0] ?? "",
      /single bullet/,
    );
  });
});

void describe("renderChangelog", () => {
  void it("groups fragments by type in section order and file-name order", () => {
    const fragments = [
      parseFragment("b.fix.md", "- Fix b.\n  Detail.\n"),
      parseFragment("x.perf.md", "- Faster x.\n"),
      parseFragment("a.fix.md", "- Fix a.\n\n  - Sub.\n"),
      parseFragment("n.add.md", "- Add n.\n"),
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
        "",
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
