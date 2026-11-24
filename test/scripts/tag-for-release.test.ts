import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { tagForRelease, tagMessage } from "../../scripts/tag-for-release";

void describe("tagMessage", () => {
  void it("drops the version heading and the blank line below it", () => {
    const root = mkdtempSync(path.join(tmpdir(), "knavi-tag-"));
    try {
      mkdirSync(path.join(root, "changelog"));
      writeFileSync(
        path.join(root, "changelog/1.0.0.md"),
        "# Version 1.0.0\n\nDigest line.\n\n- Fix\n",
      );
      assert.strictEqual(tagMessage("1.0.0", root), "Digest line.\n\n- Fix\n");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

void describe("tagForRelease", () => {
  const setup = (digest: string) => {
    const root = mkdtempSync(path.join(tmpdir(), "knavi-tag-"));
    mkdirSync(path.join(root, "changelog"));
    writeFileSync(
      path.join(root, "changelog/1.0.0.md"),
      `# Version 1.0.0\n\n${digest}\n\n- Fix\n`,
    );
    return root;
  };

  void it("runs git tag with the message when the check passes", () => {
    const root = setup("Digest line.");
    try {
      const calls: [string, string][] = [];
      const code = tagForRelease("1.0.0", root, (v, m) => {
        calls.push([v, m]);
        return 0;
      });
      assert.strictEqual(code, 0);
      assert.deepStrictEqual(calls, [["1.0.0", "Digest line.\n\n- Fix\n"]]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  void it("does not run git and fails when the check fails", () => {
    const root = setup("TODO: write a one-line release digest");
    try {
      let called = false;
      const code = tagForRelease("1.0.0", root, () => {
        called = true;
        return 0;
      });
      assert.notStrictEqual(code, 0);
      assert.strictEqual(called, false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  void it("fails when git tag fails", () => {
    const root = setup("Digest line.");
    try {
      assert.strictEqual(
        tagForRelease("1.0.0", root, () => 128),
        128,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
