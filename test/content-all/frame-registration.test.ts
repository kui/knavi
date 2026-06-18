import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";

interface PostedMessage {
  target: unknown;
  data: unknown;
  targetOrigin: string;
}

const postedMessages: PostedMessage[] = [];
const messageListeners: ((e: MessageEvent) => void)[] = [];
const sentToRuntime: { type: string; payload: unknown }[] = [];

const fakeWindow = {
  addEventListener: (type: string, l: (e: MessageEvent) => void) => {
    if (type === "message") messageListeners.push(l);
  },
  removeEventListener: () => {
    // no-op for tests — listeners stay registered
  },
};

(globalThis as Record<string, unknown>).window = fakeWindow;

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

setParent({
  postMessage: (data: unknown, targetOrigin: string) =>
    postedMessages.push({ target: "parent", data, targetOrigin }),
});

const { setupFrameRegistration } =
  await import("../../src/content-all/frame-registration.js");

function fireMessage(event: Partial<MessageEvent>) {
  for (const l of messageListeners) l(event as MessageEvent);
}

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

void describe("announceFrameIdToParent (via setupFrameRegistration)", () => {
  beforeEach(() => {
    postedMessages.length = 0;
    sentToRuntime.length = 0;
    messageListeners.length = 0;
  });

  void test("no-ops when running in the root frame", async () => {
    setParent(fakeWindow); // parent === window
    setupFrameRegistration();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(postedMessages.length, 0);
  });

  void test("posts {@type, frameId} to parent with targetOrigin '*'", async () => {
    const fakeParent = {
      postMessage: (data: unknown, targetOrigin: string) =>
        postedMessages.push({ target: "parent", data, targetOrigin }),
    };
    setParent(fakeParent);
    setupFrameRegistration();
    await Promise.resolve();
    await Promise.resolve();
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

void describe("setupFrameRegistration", () => {
  beforeEach(() => {
    postedMessages.length = 0;
    sentToRuntime.length = 0;
    messageListeners.length = 0;
  });

  void test("registers child iframe in Maps when FrameIdAnnouncement arrives", async () => {
    setParent(fakeWindow);
    const { iframeByFrameId, iframeToFrameId } = setupFrameRegistration();

    const fakeSource = makeWindowSource();
    const fakeIframe = {
      contentWindow: fakeSource,
    } as unknown as HTMLIFrameElement;

    // Simulate document.getElementsByTagName("iframe") returning [fakeIframe]
    (globalThis as Record<string, unknown>).document = {
      getElementsByTagName: () => [fakeIframe],
    };

    fireMessage({
      data: { "@type": "com.github.kui.knavi.FrameIdAnnouncement", frameId: 7 },
      source: fakeSource,
    });

    // Wait for myFrameIdPromise to resolve so the response postMessage fires
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(iframeByFrameId.get(7), fakeIframe);
    assert.equal(iframeToFrameId.get(fakeIframe), 7);
  });

  void test("replies to child with ParentFrameIdResponse", async () => {
    setParent(fakeWindow);
    setupFrameRegistration();

    const replies: unknown[] = [];
    const fakeSource = makeWindowSource((data) => replies.push(data));
    const fakeIframe = {
      contentWindow: fakeSource,
    } as unknown as HTMLIFrameElement;

    (globalThis as Record<string, unknown>).document = {
      getElementsByTagName: () => [fakeIframe],
    };

    fireMessage({
      data: { "@type": "com.github.kui.knavi.FrameIdAnnouncement", frameId: 9 },
      source: fakeSource,
    });

    await Promise.resolve();
    await Promise.resolve();

    assert.equal(replies.length, 1);
    assert.deepEqual(replies[0], {
      "@type": "com.github.kui.knavi.ParentFrameIdResponse",
      parentFrameId: 42,
    });
  });

  void test("parentFrameIdPromise resolves to undefined in root frame", async () => {
    setParent(fakeWindow); // parent === window → root frame
    const { parentFrameIdPromise } = setupFrameRegistration();
    const result = await parentFrameIdPromise;
    assert.equal(result, undefined);
  });

  void test("parentFrameIdPromise resolves to parentFrameId when response arrives", async () => {
    const fakeParent = {
      postMessage: (data: unknown, targetOrigin: string) =>
        postedMessages.push({ target: "parent", data, targetOrigin }),
    };
    setParent(fakeParent); // non-root frame

    const { parentFrameIdPromise } = setupFrameRegistration();

    // Simulate the parent sending back a ParentFrameIdResponse
    fireMessage({
      data: {
        "@type": "com.github.kui.knavi.ParentFrameIdResponse",
        parentFrameId: 100,
      },
      source: null,
    });

    const result = await parentFrameIdPromise;
    assert.equal(result, 100);
  });
});
