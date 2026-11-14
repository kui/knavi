import { beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SingleLetter } from "../../src/lib/strings.js";

let sent: string[] = [];
let releaseRemove: () => void = () => undefined;
let releaseAttach: () => void = () => undefined;
let failAttach = false;
(globalThis as Record<string, unknown>).chrome = {
  runtime: {
    sendMessage: async (msg: { "@type": string; key?: string }) => {
      const fail = failAttach;
      if (msg["@type"] === "RemoveHints") {
        await new Promise<void>((resolve) => (releaseRemove = resolve));
      }
      sent.push(msg.key ? `${msg["@type"]}:${msg.key}` : msg["@type"]);
      if (msg["@type"] === "AttachHints") {
        // WHY: the real AttachHints resolves only after all hints are rendered.
        await new Promise<void>((resolve) => (releaseAttach = resolve));
        if (fail) return { error: new Error("attach failed") };
      }
      return { response: undefined };
    },
  },
};

const { default: HinterClient } =
  await import("../../src/lib/hinter-client.js");

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const options = {
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
};

void describe("HinterClient", () => {
  beforeEach(() => {
    sent = [];
    releaseRemove = () => undefined;
    releaseAttach = () => undefined;
    failAttach = false;
  });

  void test("keys typed while the remove barrier is pending are replayed in order after attach", async () => {
    const client = new HinterClient();
    client.syncHinting(true);
    const removing = client.removeHints(options, true);
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
    await removing;
    await Promise.all(hits);
    releaseAttach();
    await attaching;
    assert.deepEqual(sent, [
      "RemoveHints",
      "AttachHints",
      "HitHint:a",
      "HitHint:s",
    ]);
  });

  void test("a failed AttachHints resets isHinting", async () => {
    failAttach = true;
    const client = new HinterClient();
    const attaching = client.attachHints();
    await flush();
    assert.equal(client.isHinting, true);

    releaseAttach();
    await assert.rejects(attaching, /attach failed/);
    assert.equal(client.isHinting, false);
  });

  void test("removeHints still sends RemoveHints when the AttachHints response fails", async () => {
    failAttach = true;
    const client = new HinterClient();
    const attaching = client.attachHints().catch(() => undefined);
    await flush();

    const removing = client.removeHints(options, false);
    await flush();
    releaseAttach();
    await attaching;
    releaseRemove();
    await removing;
    assert.deepEqual(sent, ["AttachHints", "RemoveHints"]);
  });

  void test("cycleHint typed while the remove barrier is pending is sent after attach", async () => {
    const client = new HinterClient();
    client.syncHinting(true);
    const removing = client.removeHints(options, true);
    await flush();

    const attaching = client.attachHints();
    const cycling = client.cycleHint();
    await flush();
    assert.deepEqual(sent, []);

    releaseRemove();
    await removing;
    await cycling;
    releaseAttach();
    await attaching;
    assert.deepEqual(sent, ["RemoveHints", "AttachHints", "CycleHint"]);
  });

  void test("removeHints right after hitHint is sent after the queued key", async () => {
    const client = new HinterClient();
    const attaching = client.attachHints();
    const hit = client.hitHint("a" as SingleLetter);
    const removing = client.removeHints(options, false);
    await flush();
    releaseRemove();
    await Promise.all([hit, removing]);
    releaseAttach();
    await attaching;
    assert.deepEqual(sent, ["AttachHints", "HitHint:a", "RemoveHints"]);
  });

  void test("a late failure of an older attach does not reset a newer session", async () => {
    failAttach = true;
    const client = new HinterClient();
    const first = client.attachHints().catch(() => undefined);
    await flush();
    const releaseFirst = releaseAttach;
    failAttach = false;

    const removing = client.removeHints(options, false);
    await flush();
    const second = client.attachHints();
    assert.equal(client.isHinting, true);

    releaseFirst();
    await first;
    assert.equal(client.isHinting, true);

    releaseRemove();
    await removing;
    await flush();
    releaseAttach();
    await second;
    assert.equal(client.isHinting, true);
  });
});
