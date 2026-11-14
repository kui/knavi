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

interface FakeWindow {
  parent: FakeWindow;
  frames: FakeWindow[];
  frameElement?: unknown;
  posted: unknown[];
  postMessage(data: unknown, targetOrigin: string): void;
}

function makeWindow(parent?: FakeWindow): FakeWindow {
  const w: FakeWindow = {
    parent: parent ?? (undefined as unknown as FakeWindow),
    frames: [],
    posted: [],
    postMessage(data) {
      w.posted.push(data);
    },
  };
  if (!parent) w.parent = w;
  return w;
}

function addChild(parent: FakeWindow): FakeWindow {
  const child = makeWindow(parent);
  parent.frames.push(child);
  return child;
}

function setGlobals(self: FakeWindow, document: unknown = emptyDocument()) {
  const g = globalThis as Record<string, unknown>;
  g.window = self;
  g.parent = self.parent;
  g.document = document;
}

function emptyDocument() {
  return {
    querySelectorAll: () => [],
    getElementsByTagName: () => [],
  };
}

/** A document whose only shadow host holds `iframes`. */
function documentWithShadowIframes(iframes: unknown[]) {
  return {
    querySelectorAll: () => [
      { shadowRoot: { querySelectorAll: () => iframes } },
    ],
    getElementsByTagName: () => [],
  };
}

const { FramePath } = await import("../../src/content-all/frame-path.js");

const ASSIGNMENT = "com.github.kui.knavi.FramePathAssignment";

void describe("FramePath.current", () => {
  void test("is empty in the top frame", () => {
    const top = makeWindow();
    setGlobals(top);
    assert.deepEqual(new FramePath().current(), []);
  });

  void test("counts indices in window.frames up to the top", () => {
    const top = makeWindow();
    addChild(top);
    const mid = addChild(top);
    addChild(mid);
    const leaf = addChild(mid);
    setGlobals(leaf);
    assert.deepEqual(new FramePath().current(), ["1", "1"]);
  });

  void test("is unknown for a cross-origin iframe in a shadow root", () => {
    const top = makeWindow();
    const child = makeWindow(top); // WHY: not in top.frames
    child.frameElement = undefined;
    Object.defineProperty(child, "frameElement", {
      get() {
        throw new Error("SecurityError");
      },
    });
    setGlobals(child);
    assert.equal(new FramePath().current(), undefined);
  });

  void test("uses frameElement for a same-origin iframe in a shadow root", () => {
    const top = makeWindow();
    const child = makeWindow(top);
    const other = {};
    const iframe = { ownerDocument: documentWithShadowIframes([other]) };
    iframe.ownerDocument = documentWithShadowIframes([other, iframe]);
    child.frameElement = iframe;
    setGlobals(child);
    assert.deepEqual(new FramePath().current(), ["s1"]);
  });

  void test("uses the path assigned by the parent when it cannot count one", () => {
    const top = makeWindow();
    const child = makeWindow(top);
    Object.defineProperty(child, "frameElement", {
      get() {
        throw new Error("SecurityError");
      },
    });
    setGlobals(child);
    const framePath = new FramePath();
    const changed = framePath.handleMessage(
      {
        data: { "@type": ASSIGNMENT, path: ["0", "s2"] },
        source: top,
      } as unknown as MessageEvent,
      false,
    );
    assert.equal(changed, true);
    assert.deepEqual(framePath.current(), ["0", "s2"]);
  });

  void test("ignores an assignment that does not come from the parent", () => {
    const top = makeWindow();
    const child = addChild(top);
    setGlobals(child);
    const framePath = new FramePath();
    const changed = framePath.handleMessage(
      {
        data: { "@type": ASSIGNMENT, path: ["5"] },
        source: makeWindow(),
      } as unknown as MessageEvent,
      false,
    );
    assert.equal(changed, false);
    assert.deepEqual(framePath.current(), ["0"]);
  });
});

void describe("FramePath.handleMessage", () => {
  beforeEach(() => {
    sentToRuntime.length = 0;
  });

  function setupAssignedChild() {
    const top = makeWindow();
    const frame = makeWindow(top);
    Object.defineProperty(frame, "frameElement", {
      get() {
        throw new Error("SecurityError");
      },
    });
    const grandchild = addChild(frame);
    setGlobals(frame);
    const assign = (
      framePath: InstanceType<typeof FramePath>,
      hinting: boolean,
    ) =>
      framePath.handleMessage(
        {
          data: { "@type": ASSIGNMENT, path: ["s0"] },
          source: top,
        } as unknown as MessageEvent,
        hinting,
      );
    return { grandchild, assign };
  }

  void test("returns true only when the assigned path changed", () => {
    const { assign } = setupAssignedChild();
    const framePath = new FramePath();
    assert.equal(assign(framePath, false), true);
    assert.equal(assign(framePath, false), false);
  });

  void test("reports the assigned path while hinting, even if unchanged", async () => {
    const { assign } = setupAssignedChild();
    const framePath = new FramePath();
    assign(framePath, false);
    assert.equal(sentToRuntime.length, 0);
    assign(framePath, true);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(sentToRuntime.length, 1);
    assert.deepEqual((sentToRuntime[0].payload as { path: string[] }).path, [
      "s0",
    ]);
  });

  void test("passes the assignment on to the children even if unchanged", () => {
    const { assign, grandchild } = setupAssignedChild();
    const framePath = new FramePath();
    assign(framePath, false);
    assign(framePath, false);
    assert.equal(grandchild.posted.length, 2);
  });
});

void describe("FramePath.matches", () => {
  void test("compares the whole path", () => {
    const top = makeWindow();
    addChild(top);
    const child = addChild(top);
    setGlobals(child);
    const framePath = new FramePath();
    assert.equal(framePath.matches(["1"]), true);
    assert.equal(framePath.matches(["0"]), false);
    assert.equal(framePath.matches(["1", "0"]), false);
    assert.equal(framePath.matches([]), false);
  });
});

void describe("FramePath.childPath", () => {
  void test("indexes a light-DOM iframe by its window.frames position", () => {
    const top = makeWindow();
    addChild(top);
    const child = addChild(top);
    setGlobals(top);
    const iframe = { contentWindow: child } as unknown as HTMLIFrameElement;
    assert.deepEqual(new FramePath().childPath(iframe), ["1"]);
  });

  void test("names an iframe in a shadow root by its shadow index", () => {
    const top = makeWindow();
    const child = makeWindow(top);
    const iframe = { contentWindow: child } as unknown as HTMLIFrameElement;
    setGlobals(top, documentWithShadowIframes([{}, iframe]));
    assert.deepEqual(new FramePath().childPath(iframe), ["s1"]);
  });
});

void describe("FramePath.reportAtStartup", () => {
  beforeEach(() => {
    sentToRuntime.length = 0;
  });

  void test("reports a computable path", async () => {
    const top = makeWindow();
    const child = addChild(top);
    setGlobals(child);
    await new FramePath().reportAtStartup();
    assert.deepEqual((sentToRuntime[0].payload as { path: string[] }).path, [
      "0",
    ]);
  });

  void test("reports nothing when the path is unknown", async () => {
    const top = makeWindow();
    const child = makeWindow(top);
    Object.defineProperty(child, "frameElement", {
      get() {
        throw new Error("SecurityError");
      },
    });
    setGlobals(child);
    await new FramePath().reportAtStartup();
    assert.equal(sentToRuntime.length, 0);
  });
});

void describe("FramePath.announce", () => {
  beforeEach(() => {
    sentToRuntime.length = 0;
  });

  void test("reports the path to the background", async () => {
    const top = makeWindow();
    const child = addChild(top);
    setGlobals(child);
    await new FramePath().announce();
    assert.equal(sentToRuntime.length, 1);
    assert.equal(sentToRuntime[0].type, "ReportFramePath");
    assert.deepEqual((sentToRuntime[0].payload as { path: string[] }).path, [
      "0",
    ]);
  });

  void test("posts to a cross-origin shadow iframe but not to light-DOM children", async () => {
    const top = makeWindow();
    const lightChild = addChild(top);
    const shadowChild = makeWindow(top);
    const iframe = {
      contentWindow: shadowChild,
      contentDocument: null,
    } as unknown as HTMLIFrameElement;
    setGlobals(top, documentWithShadowIframes([iframe]));
    await new FramePath().announce();
    assert.deepEqual(shadowChild.posted, [
      { "@type": ASSIGNMENT, path: ["s0"] },
    ]);
    assert.deepEqual(lightChild.posted, []);
  });

  void test("does not post to a same-origin shadow iframe", async () => {
    const top = makeWindow();
    const shadowChild = makeWindow(top);
    const iframe = {
      contentWindow: shadowChild,
      contentDocument: {},
    } as unknown as HTMLIFrameElement;
    setGlobals(top, documentWithShadowIframes([iframe]));
    await new FramePath().announce();
    assert.deepEqual(shadowChild.posted, []);
  });

  void test("does not report an assigned path kept from a previous session", async () => {
    const top = makeWindow();
    const frame = makeWindow(top);
    Object.defineProperty(frame, "frameElement", {
      get() {
        throw new Error("SecurityError");
      },
    });
    setGlobals(frame);
    const framePath = new FramePath();
    framePath.handleMessage(
      {
        data: { "@type": ASSIGNMENT, path: ["s0"] },
        source: top,
      } as unknown as MessageEvent,
      false,
    );
    framePath.handleHintingState(false);
    await framePath.announce();
    assert.equal(sentToRuntime.length, 0);
  });

  void test("reports a path assigned for this session before it started hinting", async () => {
    const top = makeWindow();
    const frame = makeWindow(top);
    Object.defineProperty(frame, "frameElement", {
      get() {
        throw new Error("SecurityError");
      },
    });
    setGlobals(frame);
    const framePath = new FramePath();
    framePath.handleHintingState(false);
    framePath.handleMessage(
      {
        data: { "@type": ASSIGNMENT, path: ["s0"] },
        source: top,
      } as unknown as MessageEvent,
      false,
    );
    await framePath.announce();
    assert.deepEqual(
      sentToRuntime.map((m) => (m.payload as { path: string[] }).path),
      [["s0"]],
    );
  });

  void test("a frame with an assigned path assigns its children's paths", async () => {
    const top = makeWindow();
    const frame = makeWindow(top);
    Object.defineProperty(frame, "frameElement", {
      get() {
        throw new Error("SecurityError");
      },
    });
    const grandchild = addChild(frame);
    setGlobals(frame);
    const framePath = new FramePath();
    framePath.handleMessage(
      {
        data: { "@type": ASSIGNMENT, path: ["s0"] },
        source: top,
      } as unknown as MessageEvent,
      false,
    );
    grandchild.posted.length = 0;
    await framePath.announce();
    assert.deepEqual(grandchild.posted, [
      { "@type": ASSIGNMENT, path: ["s0", "0"] },
    ]);
  });
});
