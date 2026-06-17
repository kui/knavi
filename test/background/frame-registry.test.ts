import { describe, test } from "node:test";
import assert from "node:assert/strict";

type ConnectListener = (port: FakePort) => void;
type RemovedListener = (tabId: number) => void;

interface FakePort {
  name: string;
  sender?: { tab?: { id?: number }; frameId?: number };
  onDisconnect: { addListener: (l: () => void) => void };
}

interface SentTabMessage {
  tabId: number;
  type: string;
  payload: unknown;
  options: chrome.tabs.MessageSendOptions;
}

const connectListeners: ConnectListener[] = [];
const removedListeners: RemovedListener[] = [];
const sentTabMessages: SentTabMessage[] = [];
const noop = (): void => undefined;

(globalThis as Record<string, unknown>).chrome = {
  runtime: {
    onConnect: {
      addListener: (l: ConnectListener) => connectListeners.push(l),
    },
  },
  tabs: {
    onRemoved: {
      addListener: (l: RemovedListener) => removedListeners.push(l),
    },
    sendMessage: (
      tabId: number,
      msg: { "@type": string },
      options: chrome.tabs.MessageSendOptions,
    ) => {
      sentTabMessages.push({
        tabId,
        type: msg["@type"],
        payload: msg,
        options,
      });
      return Promise.resolve({ response: undefined });
    },
  },
};

const { router, getParentFrameId } =
  await import("../../src/background/frame-registry.js");

const listener = router.buildListener();

function register(tabId: number, parentFrameId: number, childFrameId: number) {
  listener(
    { "@type": "RegisterChildFrame", childFrameId },
    {
      tab: { id: tabId },
      frameId: parentFrameId,
    } as chrome.runtime.MessageSender,
    noop,
  );
}

function connectAndDisconnect(port: FakePort) {
  const disconnectHandlers: (() => void)[] = [];
  port.onDisconnect = {
    addListener: (l: () => void) => disconnectHandlers.push(l),
  };
  for (const l of connectListeners) l(port);
  return () => disconnectHandlers.forEach((h) => h());
}

void describe("frame-registry", () => {
  void test("registers child→parent mapping per tab", () => {
    register(1, 0, 5);
    register(1, 5, 7);
    register(2, 0, 5);
    assert.equal(getParentFrameId(1, 5), 0);
    assert.equal(getParentFrameId(1, 7), 5);
    assert.equal(getParentFrameId(2, 5), 0);
    assert.equal(getParentFrameId(1, 999), undefined);
    assert.equal(getParentFrameId(999, 5), undefined);
  });

  void test("port disconnect removes the disconnecting frame's entry and notifies the parent", () => {
    sentTabMessages.length = 0;
    register(10, 0, 50);
    register(10, 50, 51);

    const disconnect = connectAndDisconnect({
      name: "frame-lifetime",
      sender: { tab: { id: 10 }, frameId: 50 },
      onDisconnect: { addListener: noop },
    });
    disconnect();

    assert.equal(getParentFrameId(10, 50), undefined);
    // Sibling/descendant entries are not touched by a single disconnect.
    assert.equal(getParentFrameId(10, 51), 50);

    assert.equal(sentTabMessages.length, 1);
    assert.equal(sentTabMessages[0].tabId, 10);
    assert.equal(sentTabMessages[0].type, "UnregisterChildFrame");
    assert.deepEqual(sentTabMessages[0].payload, {
      "@type": "UnregisterChildFrame",
      childFrameId: 50,
    });
    assert.deepEqual(sentTabMessages[0].options, { frameId: 0 });
  });

  void test("port disconnect for an unknown frame does not send a message", () => {
    sentTabMessages.length = 0;
    const disconnect = connectAndDisconnect({
      name: "frame-lifetime",
      sender: { tab: { id: 100 }, frameId: 500 },
      onDisconnect: { addListener: noop },
    });
    disconnect();
    assert.equal(sentTabMessages.length, 0);
  });

  void test("ignores ports with other names", () => {
    register(20, 0, 60);

    const disconnectHandlers: (() => void)[] = [];
    const port: FakePort = {
      name: "something-else",
      sender: { tab: { id: 20 }, frameId: 60 },
      onDisconnect: {
        addListener: (l: () => void) => disconnectHandlers.push(l),
      },
    };
    for (const l of connectListeners) l(port);

    assert.equal(
      disconnectHandlers.length,
      0,
      "no disconnect listener should be attached for unrelated ports",
    );
    assert.equal(getParentFrameId(20, 60), 0);
  });

  void test("disconnect without sender info is a no-op", () => {
    register(30, 0, 70);
    const disconnect = connectAndDisconnect({
      name: "frame-lifetime",
      sender: undefined,
      onDisconnect: { addListener: noop },
    });
    disconnect();
    assert.equal(getParentFrameId(30, 70), 0);
  });

  void test("tab removal clears all entries for that tab", () => {
    register(40, 0, 80);
    register(40, 80, 81);
    register(41, 0, 80);

    for (const l of removedListeners) l(40);

    assert.equal(getParentFrameId(40, 80), undefined);
    assert.equal(getParentFrameId(40, 81), undefined);
    assert.equal(getParentFrameId(41, 80), 0, "other tab unaffected");
  });
});
