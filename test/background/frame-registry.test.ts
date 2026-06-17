import { describe, test } from "node:test";
import assert from "node:assert/strict";

type ConnectListener = (port: FakePort) => void;
type RemovedListener = (tabId: number) => void;

interface FakePort {
  name: string;
  sender?: { tab?: { id?: number }; frameId?: number };
  onDisconnect: { addListener: (l: () => void) => void };
}

const connectListeners: ConnectListener[] = [];
const removedListeners: RemovedListener[] = [];
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

  void test("port disconnect removes the disconnecting frame's entry", () => {
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
