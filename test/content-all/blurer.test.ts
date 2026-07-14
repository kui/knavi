import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";

const sentToRuntime: { type: string; payload: unknown }[] = [];

(globalThis as Record<string, unknown>).chrome = {
  runtime: {
    sendMessage: (msg: { "@type": string }) => {
      sentToRuntime.push({ type: msg["@type"], payload: msg });
      if (msg["@type"] === "GetFrameId")
        return Promise.resolve({ response: 10 });
      return Promise.resolve({ response: undefined });
    },
  },
};

const fakeWindow = {};
(globalThis as Record<string, unknown>).window = fakeWindow;
(globalThis as Record<string, unknown>).parent = fakeWindow;

const { BlurerContentAll } = await import("../../src/content-all/blurer.js");
const { FrameRegistry } =
  await import("../../src/content-all/frame-registration.js");

function makeRegistry(): InstanceType<typeof FrameRegistry> {
  return new FrameRegistry();
}

function makeRectJson(
  overrides: Partial<RectJSON<"element-border", "layout-viewport">> = {},
): RectJSON<"element-border", "layout-viewport"> {
  return {
    type: "element-border",
    origin: "layout-viewport",
    x: 10,
    y: 20,
    width: 100,
    height: 50,
    ...overrides,
  };
}

void describe("BlurerContentAll.handleBlurRelay", () => {
  beforeEach(() => {
    sentToRuntime.length = 0;
  });

  void test("propagates null rect as-is when input rect is null", async () => {
    const registry = makeRegistry();

    const fakeSource = { window: {} } as unknown as Window;
    const fakeIframe = {
      tagName: "IFRAME",
      contentWindow: fakeSource,
      isConnected: true,
    } as unknown as HTMLIFrameElement;

    (globalThis as Record<string, unknown>).document = {
      getElementsByTagName: () => [fakeIframe],
      querySelectorAll: () => [],
    };

    registry.handleMessage({
      data: {
        "@type": "com.github.kui.knavi.FrameIdAnnouncement",
        frameId: 5,
      },
      source: fakeSource,
    } as MessageEvent);

    // WHY: clear GetFrameId messages recorded during registry setup.
    sentToRuntime.length = 0;

    const blurer = new BlurerContentAll(registry);
    blurer.handleBlurRelay(5, null);

    // WHY: wait for the async sendToRuntime call.
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.equal(sentToRuntime.length, 1);
    const sent = sentToRuntime[0];
    assert.equal(sent.type, "BlurUp");
    // INVARIANT: null rect must be forwarded, not swallowed
    assert.equal((sent.payload as Record<string, unknown>).rect, null);
  });

  void test("propagates null rect when iframe has no renderable content rect", async () => {
    const registry = makeRegistry();

    const fakeSource = { window: {} } as unknown as Window;
    // WHY: getClientRects returns an empty iterable (zero-size / display:none iframe).
    const fakeIframe = {
      tagName: "IFRAME",
      contentWindow: fakeSource,
      isConnected: true,
      getClientRects: () => [] as DOMRect[],
      computedStyleMap: () => ({ get: () => undefined }),
    } as unknown as HTMLIFrameElement;

    (globalThis as Record<string, unknown>).document = {
      getElementsByTagName: () => [fakeIframe],
      querySelectorAll: () => [],
    };

    registry.handleMessage({
      data: {
        "@type": "com.github.kui.knavi.FrameIdAnnouncement",
        frameId: 6,
      },
      source: fakeSource,
    } as MessageEvent);

    sentToRuntime.length = 0;

    const blurer = new BlurerContentAll(registry);
    blurer.handleBlurRelay(6, makeRectJson());

    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.equal(sentToRuntime.length, 1);
    assert.equal(sentToRuntime[0].type, "BlurUp");
    assert.equal(
      (sentToRuntime[0].payload as Record<string, unknown>).rect,
      null,
    );
  });
});
