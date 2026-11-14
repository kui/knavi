import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";

const sentToRuntime: { type: string; payload: unknown }[] = [];

(globalThis as Record<string, unknown>).chrome = {
  runtime: {
    sendMessage: (msg: { "@type": string }) => {
      sentToRuntime.push({ type: msg["@type"], payload: msg });
      return Promise.resolve({ response: undefined });
    },
  },
};

const { default: BlurerClient } =
  await import("../../src/content-all/blurer-client.js");
type FramePath = ConstructorParameters<typeof BlurerClient>[0];

function setGlobals(activeElement: unknown) {
  const g = globalThis as Record<string, unknown>;
  const fakeWindow = {};
  g.window = fakeWindow;
  g.parent = {}; // WHY: not the top frame
  g.document = { activeElement, body: {} };
}

void describe("BlurerClient.blur", () => {
  beforeEach(() => {
    sentToRuntime.length = 0;
  });

  void test("handles the key and blurs locally when the frame's path is unknown", async () => {
    let blurred = false;
    setGlobals({ blur: () => (blurred = true) });
    const client = new BlurerClient({
      current: () => undefined,
    } as unknown as FramePath);

    assert.equal(client.blur(), true);
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.equal(blurred, true);
    assert.equal(sentToRuntime.length, 0);
  });
});
