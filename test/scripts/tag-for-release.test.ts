import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { tagMessage } from "../../scripts/tag-for-release";

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
