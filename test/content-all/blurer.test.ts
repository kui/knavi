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

const { BlurerContentAll } = await import("../../src/content-all/blurer.js");
type FramePath = ConstructorParameters<typeof BlurerContentAll>[0];

const PARENT_PATH = ["2"];

function makeFramePath(
  iframe: HTMLIFrameElement | undefined,
  ownPath = PARENT_PATH,
): FramePath {
  return {
    matches: (p: string[]) => p.join() === ownPath.join(),
    findChild: () => iframe,
  } as unknown as FramePath;
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
    const iframe = {
      tagName: "IFRAME",
      isConnected: true,
    } as unknown as HTMLIFrameElement;

    new BlurerContentAll(makeFramePath(iframe)).handleBlurRelay(
      PARENT_PATH,
      "0",
      null,
    );
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.equal(sentToRuntime.length, 1);
    const sent = sentToRuntime[0];
    assert.equal(sent.type, "BlurUp");
    // INVARIANT: null rect must be forwarded, not swallowed
    assert.equal((sent.payload as Record<string, unknown>).rect, null);
    assert.deepEqual(
      (sent.payload as Record<string, unknown>).path,
      PARENT_PATH,
    );
  });

  void test("propagates null rect when iframe has no renderable content rect", async () => {
    // WHY: getClientRects returns an empty iterable (zero-size / display:none iframe).
    const iframe = {
      tagName: "IFRAME",
      isConnected: true,
      getClientRects: () => [] as DOMRect[],
      computedStyleMap: () => ({ get: () => undefined }),
    } as unknown as HTMLIFrameElement;

    new BlurerContentAll(makeFramePath(iframe)).handleBlurRelay(
      PARENT_PATH,
      "0",
      makeRectJson(),
    );
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.equal(sentToRuntime.length, 1);
    assert.equal(sentToRuntime[0].type, "BlurUp");
    assert.equal(
      (sentToRuntime[0].payload as Record<string, unknown>).rect,
      null,
    );
  });

  void test("ignores a relay addressed to another frame's path", async () => {
    const iframe = {
      tagName: "IFRAME",
      isConnected: true,
    } as unknown as HTMLIFrameElement;

    new BlurerContentAll(makeFramePath(iframe)).handleBlurRelay(
      ["3"],
      "0",
      null,
    );
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.equal(sentToRuntime.length, 0);
  });
});
