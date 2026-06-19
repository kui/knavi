import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";

interface PostedMessage {
  target: unknown;
  data: unknown;
  targetOrigin: string;
}

const postedMessages: PostedMessage[] = [];
const sentToRuntime: { type: string; payload: unknown }[] = [];

(globalThis as Record<string, unknown>).chrome = {
  runtime: {
    sendMessage: (msg: { "@type": string }) => {
      sentToRuntime.push({ type: msg["@type"], payload: msg });
      if (msg["@type"] === "GetFrameId")
        return Promise.resolve({ response: 42 });
      return Promise.resolve({ response: undefined });
    },
  },
};

function setParent(p: unknown) {
  (globalThis as Record<string, unknown>).parent = p;
}

const fakeWindow = {};
(globalThis as Record<string, unknown>).window = fakeWindow;
setParent(fakeWindow);

const { FrameRegistry } =
  await import("../../src/content-all/frame-registration.js");

// Duck-type via `"window" in source` to identify a Window source.
function makeWindowSource(
  onPostMessage?: (data: unknown, origin: string) => void,
): Window {
  const w: Record<string, unknown> = {};
  w.window = w;
  w.postMessage = (data: unknown, targetOrigin: string) => {
    postedMessages.push({ target: w, data, targetOrigin });
    onPostMessage?.(data, targetOrigin);
  };
  return w as unknown as Window;
}

void describe("FrameRegistry — announcement to parent", () => {
  beforeEach(() => {
    postedMessages.length = 0;
    sentToRuntime.length = 0;
    (globalThis as Record<string, unknown>).document = undefined;
  });

  void test("no-ops when running in the root frame", async () => {
    setParent(fakeWindow); // parent === window
    new FrameRegistry();
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(postedMessages.length, 0);
  });

  void test("posts {@type, frameId} to parent with targetOrigin '*'", async () => {
    const fakeParent = {
      postMessage: (data: unknown, targetOrigin: string) =>
        postedMessages.push({ target: "parent", data, targetOrigin }),
    };
    setParent(fakeParent);
    new FrameRegistry();
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(postedMessages.length, 1);
    assert.deepEqual(postedMessages[0], {
      target: "parent",
      data: {
        "@type": "com.github.kui.knavi.FrameIdAnnouncement",
        frameId: 42,
      },
      targetOrigin: "*",
    });
  });
});

void describe("FrameRegistry — child iframe registration", () => {
  beforeEach(() => {
    postedMessages.length = 0;
    sentToRuntime.length = 0;
    (globalThis as Record<string, unknown>).document = undefined;
  });

  void test("registers child iframe when FrameIdAnnouncement arrives", async () => {
    setParent(fakeWindow);
    const registry = new FrameRegistry();

    const fakeSource = makeWindowSource();
    const fakeIframe = {
      contentWindow: fakeSource,
      isConnected: true,
    } as unknown as HTMLIFrameElement;

    (globalThis as Record<string, unknown>).document = {
      getElementsByTagName: () => [fakeIframe],
    };

    registry.handleMessage({
      data: { "@type": "com.github.kui.knavi.FrameIdAnnouncement", frameId: 7 },
      source: fakeSource,
    } as MessageEvent);

    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.equal(registry.getIframe(7), fakeIframe);
    assert.equal(registry.getFrameId(fakeIframe), 7);
  });

  void test("purges disconnected iframes on new announcement", () => {
    setParent(fakeWindow);
    const registry = new FrameRegistry();

    const oldSource = makeWindowSource();
    const oldIframe = {
      contentWindow: oldSource,
      isConnected: true,
    } as unknown as HTMLIFrameElement & { isConnected: boolean };

    (globalThis as Record<string, unknown>).document = {
      getElementsByTagName: () => [oldIframe],
    };
    registry.handleMessage({
      data: { "@type": "com.github.kui.knavi.FrameIdAnnouncement", frameId: 1 },
      source: oldSource,
    } as MessageEvent);
    assert.equal(registry.getFrameId(oldIframe), 1);

    oldIframe.isConnected = false;

    const newSource = makeWindowSource();
    const newIframe = {
      contentWindow: newSource,
      isConnected: true,
    } as unknown as HTMLIFrameElement;
    (globalThis as Record<string, unknown>).document = {
      getElementsByTagName: () => [newIframe],
    };
    registry.handleMessage({
      data: { "@type": "com.github.kui.knavi.FrameIdAnnouncement", frameId: 2 },
      source: newSource,
    } as MessageEvent);

    assert.equal(registry.getFrameId(oldIframe), undefined);
    assert.equal(registry.getIframe(1), undefined);
    assert.equal(registry.getFrameId(newIframe), 2);
  });

  void test("replies to child with ParentFrameIdResponse", async () => {
    setParent(fakeWindow);
    const registry = new FrameRegistry();

    const replies: unknown[] = [];
    const fakeSource = makeWindowSource((data) => replies.push(data));
    const fakeIframe = {
      contentWindow: fakeSource,
    } as unknown as HTMLIFrameElement;

    (globalThis as Record<string, unknown>).document = {
      getElementsByTagName: () => [fakeIframe],
    };

    registry.handleMessage({
      data: { "@type": "com.github.kui.knavi.FrameIdAnnouncement", frameId: 9 },
      source: fakeSource,
    } as MessageEvent);

    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.equal(replies.length, 1);
    assert.deepEqual(replies[0], {
      "@type": "com.github.kui.knavi.ParentFrameIdResponse",
      parentFrameId: 42,
    });
  });
});

void describe("FrameRegistry — parentFrameId resolution", () => {
  beforeEach(() => {
    postedMessages.length = 0;
    sentToRuntime.length = 0;
    (globalThis as Record<string, unknown>).document = undefined;
  });

  void test("resolves to undefined in root frame", async () => {
    setParent(fakeWindow); // parent === window → root frame
    const registry = new FrameRegistry();
    const result = await registry.parentFrameId;
    assert.equal(result, undefined);
  });

  void test("resolves to parentFrameId when response arrives", async () => {
    const fakeParent = {
      postMessage: (data: unknown, targetOrigin: string) =>
        postedMessages.push({ target: "parent", data, targetOrigin }),
    };
    setParent(fakeParent); // non-root frame

    const registry = new FrameRegistry();

    registry.handleMessage({
      data: {
        "@type": "com.github.kui.knavi.ParentFrameIdResponse",
        parentFrameId: 100,
      },
      source: fakeParent,
    } as unknown as MessageEvent);

    const result = await registry.parentFrameId;
    assert.equal(result, 100);
  });

  void test("second ParentFrameIdResponse is ignored by Promise resolution semantics", async () => {
    const fakeParent = {
      postMessage: (data: unknown, targetOrigin: string) =>
        postedMessages.push({ target: "parent", data, targetOrigin }),
    };
    setParent(fakeParent);

    const registry = new FrameRegistry();

    const firstMsg = {
      data: {
        "@type": "com.github.kui.knavi.ParentFrameIdResponse",
        parentFrameId: 100,
      },
      source: fakeParent,
    } as unknown as MessageEvent;
    const secondMsg = {
      data: {
        "@type": "com.github.kui.knavi.ParentFrameIdResponse",
        parentFrameId: 999,
      },
      source: fakeParent,
    } as unknown as MessageEvent;
    registry.handleMessage(firstMsg);
    registry.handleMessage(secondMsg); // ignored: Promise already resolved to 100

    const result = await registry.parentFrameId;
    assert.equal(result, 100);
  });
});
