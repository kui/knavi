import { beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SingleLetter } from "../../src/lib/strings.js";

let sent: string[] = [];
let releaseRemove: () => void = () => undefined;
let releaseAttach: () => void = () => undefined;
let failAttach = false;
let nextSessionId = 1;
(globalThis as Record<string, unknown>).chrome = {
  runtime: {
    sendMessage: async (msg: {
      "@type": string;
      key?: string;
      sessionId?: number;
    }) => {
      const fail = failAttach;
      // WHY: record at send time so the order reflects when each message was sent.
      const id = msg.sessionId === undefined ? "" : `@${msg.sessionId}`;
      sent.push(msg.key ? `${msg["@type"]}:${msg.key}${id}` : msg["@type"]);
      if (msg["@type"] === "RemoveHints") {
        await new Promise<void>((resolve) => (releaseRemove = resolve));
      }
      if (msg["@type"] === "AttachHints") {
        // WHY: the real AttachHints is answered once content-root starts the session.
        await new Promise<void>((resolve) => (releaseAttach = resolve));
        if (fail) return { error: new Error("attach failed") };
        return { response: { sessionId: nextSessionId++ } };
      }
      return { response: undefined };
    },
  },
};

const { default: HinterClient, TabSession } =
  await import("../../src/lib/hinter-client.js");

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const options = {
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
};

void describe("TabSession", () => {
  void test("drops updates older than the latest id", () => {
    const s = new TabSession();
    assert.equal(s.apply(true, 2), true);
    assert.equal(s.apply(false, 1), false);
    assert.equal(s.apply(true, 1), false);
    assert.equal(s.id, 2);
  });

  void test("a true after the false of the same id does not revive it", () => {
    const s = new TabSession();
    assert.equal(s.apply(false, 3), true);
    assert.equal(s.apply(true, 3), false);
    assert.equal(s.id, null);
  });

  void test("a duplicate true is applied as a no-op", () => {
    const s = new TabSession();
    s.apply(true, 1);
    assert.equal(s.apply(true, 1), true);
    assert.equal(s.id, 1);
  });
});

void describe("HinterClient", () => {
  beforeEach(() => {
    sent = [];
    releaseRemove = () => undefined;
    releaseAttach = () => undefined;
    failAttach = false;
    nextSessionId = 1;
  });

  void test("keys typed while the previous RemoveHints is pending are sent in order after attach", async () => {
    nextSessionId = 2;
    const client = new HinterClient();
    client.syncHinting(true, 1);
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
    assert.deepEqual(sent, ["RemoveHints"]);

    releaseRemove();
    await removing;
    await flush();
    assert.deepEqual(sent, ["RemoveHints", "AttachHints"]);
    releaseAttach();
    await attaching;
    await Promise.all(hits);
    assert.deepEqual(sent, [
      "RemoveHints",
      "AttachHints",
      "HitHint:a@2",
      "HitHint:s@2",
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

  void test("removeHints of a failed attach sends nothing", async () => {
    failAttach = true;
    const client = new HinterClient();
    const attaching = client.attachHints().catch(() => undefined);
    await flush();

    const removing = client.removeHints(options, false);
    releaseAttach();
    await attaching;
    await removing;
    assert.deepEqual(sent, ["AttachHints"]);
  });

  void test("cycleHint typed while the previous RemoveHints is pending is sent after attach", async () => {
    nextSessionId = 2;
    const client = new HinterClient();
    client.syncHinting(true, 1);
    const removing = client.removeHints(options, true);
    await flush();

    const attaching = client.attachHints();
    const cycling = client.cycleHint();
    await flush();
    assert.deepEqual(sent, ["RemoveHints"]);

    releaseRemove();
    await removing;
    await flush();
    releaseAttach();
    await attaching;
    await cycling;
    assert.deepEqual(sent, ["RemoveHints", "AttachHints", "CycleHint"]);
  });

  void test("removeHints right after hitHint is sent after the queued key", async () => {
    const client = new HinterClient();
    const attaching = client.attachHints();
    const hit = client.hitHint("a" as SingleLetter);
    const removing = client.removeHints(options, false);
    assert.equal(client.isHinting, false);
    await flush();
    releaseAttach();
    await attaching;
    await flush();
    releaseRemove();
    await Promise.all([hit, removing]);
    assert.deepEqual(sent, ["AttachHints", "HitHint:a@1", "RemoveHints"]);
  });

  void test("a late failure of an older attach does not reset a newer session", async () => {
    failAttach = true;
    const client = new HinterClient();
    const first = client.attachHints().catch(() => undefined);
    await flush();
    const releaseFirst = releaseAttach;
    failAttach = false;

    const removing = client.removeHints(options, false);
    const second = client.attachHints();
    assert.equal(client.isHinting, true);

    releaseFirst();
    await first;
    await removing;
    assert.equal(client.isHinting, true);

    await flush();
    releaseAttach();
    await second;
    assert.equal(client.isHinting, true);
    assert.equal(client.ownsSession, true);
    assert.deepEqual(sent, ["AttachHints", "AttachHints"]);
  });

  void test("a removeHints typed while attach waits for the previous RemoveHints is sent after AttachHints", async () => {
    const client = new HinterClient();
    client.syncHinting(true, 1);
    const first = client.removeHints(options, true);
    await flush();
    const attaching = client.attachHints();
    const second = client.removeHints(options, true);
    await flush();
    assert.deepEqual(sent, ["RemoveHints"]);

    releaseRemove();
    await first;
    await flush();
    releaseAttach();
    await attaching;
    await flush();
    assert.deepEqual(sent, ["RemoveHints", "AttachHints", "RemoveHints"]);

    releaseRemove();
    await second;
    assert.equal(client.isHinting, false);
  });

  void test("a late false of the previous session while attach is pending keeps hinting", async () => {
    nextSessionId = 2;
    const client = new HinterClient();
    client.syncHinting(true, 1);
    const removing = client.removeHints(options, true);
    const attaching = client.attachHints();

    client.syncHinting(false, 1);
    assert.equal(client.isHinting, true);
    await flush();
    releaseRemove();
    await removing;
    await flush();
    client.syncHinting(false, 1);
    assert.equal(client.isHinting, true);
    releaseAttach();
    await attaching;
    client.syncHinting(false, 1);
    assert.equal(client.isHinting, true);
    assert.equal(client.ownsSession, true);

    client.syncHinting(false, 2);
    assert.equal(client.isHinting, false);
  });

  void test("the own reply counts as the start even before the true broadcast", async () => {
    const client = new HinterClient();
    const attaching = client.attachHints();
    await flush();
    releaseAttach();
    await attaching;
    assert.equal(client.ownsSession, true);
    client.syncHinting(true, 1);
    assert.equal(client.ownsSession, true);
  });

  void test("a session announced by another frame is not owned", async () => {
    const client = new HinterClient();
    const attaching = client.attachHints();
    await flush();
    releaseAttach();
    await attaching;
    client.syncHinting(false, 1);
    client.syncHinting(true, 2);
    assert.equal(client.isHinting, true);
    assert.equal(client.ownsSession, false);
  });

  void test("a failed AttachHints does not make a later session from another frame owned", async () => {
    failAttach = true;
    const client = new HinterClient();
    const attaching = client.attachHints();
    await flush();
    releaseAttach();
    await assert.rejects(attaching, /attach failed/);

    client.syncHinting(true, 1);
    assert.equal(client.ownsSession, false);
  });
});
