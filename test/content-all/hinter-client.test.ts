import { describe, test } from "node:test";
import assert from "node:assert/strict";

const sent: string[] = [];
let releaseRemove: () => void = () => undefined;
(globalThis as Record<string, unknown>).chrome = {
  runtime: {
    sendMessage: async (msg: { "@type": string; key?: string }) => {
      if (msg["@type"] === "RemoveHints") {
        await new Promise<void>((resolve) => (releaseRemove = resolve));
      }
      sent.push(msg.key ? `${msg["@type"]}:${msg.key}` : msg["@type"]);
      return { response: undefined };
    },
  },
};

const { default: HinterClient } =
  await import("../../src/lib/hinter-client.js");

import type { SingleLetter } from "../../src/lib/strings.js";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

void describe("HinterClient", () => {
  void test("keys typed while the remove barrier is pending are replayed in order after attach", async () => {
    const client = new HinterClient();
    client.syncHinting(true);
    const removing = client.removeHints(
      { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false },
      true,
    );
    await flush();

    const attaching = client.attachHints();
    // WHY: the keyboard handler routes letters to hitHint only when isHinting.
    assert.equal(client.isHinting, true);
    const hits = [
      client.hitHint("a" as SingleLetter),
      client.hitHint("s" as SingleLetter),
    ];
    await flush();
    assert.deepEqual(sent, []);

    releaseRemove();
    await Promise.all([removing, attaching, ...hits]);
    assert.deepEqual(sent, [
      "RemoveHints",
      "AttachHints",
      "HitHint:a",
      "HitHint:s",
    ]);
  });
});
