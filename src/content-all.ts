import { RectAggregatorContentAll as RectAggregator } from "./content-all/rect-aggregator";
import { KeyboardHandlerContentAll as KeyboardHandler } from "./content-all/keyboard-handler";
import { BlurerContentAll as Blurer } from "./content-all/blurer";
import settingsClient from "./lib/settings-client";
import { printError } from "./lib/errors";
import { wait } from "./lib/promises";
import BlurerClient from "./content-all/blurer-client";
import HinterClient from "./lib/hinter-client";
import { Router as DOMMessageRouter } from "./dom/dom-messages";
import {
  Router as ChromeMessageRouter,
  sendToRuntime,
} from "./lib/chrome-messages";
import { Coordinates, Rect } from "./dom/rects";

globalThis.KNAVI_FILE = "content-all";

// Nonce received from parent frame; echoed back in Blur so the parent can verify
// the message came from a knavi-controlled frame.  Initialized at startup via
// chrome.runtime (unforgeable) so that blur-key presses work before the first
// hint cycle.
let parentNonce: string | null = null;

// Nonce this frame distributes; child frames echo it back in Blur for verification.
const childNonce = crypto.randomUUID();
const rectAggregator = new RectAggregator();

// Register childNonce with the background and, for non-root frames, fetch the
// parent frame's nonce.  Both calls go over chrome.runtime which page scripts
// cannot intercept.
(async () => {
  await sendToRuntime("RegisterFrameNonce", { nonce: childNonce });
  if (window !== window.parent) {
    // chrome.runtime.getFrameId is available since Chrome 106 (min version 114).
    const parentFrameId = (
      chrome.runtime as unknown as { getFrameId(w: Window): number }
    ).getFrameId(window.parent);
    parentNonce = await sendToRuntime("GetParentNonce", { parentFrameId });
  }
})().catch(printError);

const blurerClient = new BlurerClient(() => parentNonce);
const hinterClient = new HinterClient();
const keyboardHandler = new KeyboardHandler(blurerClient, hinterClient);
const blurer = new Blurer();

async function setup() {
  const [setting, matchedBlacklist] = await Promise.all([
    settingsClient.get([
      "magicKey",
      "blurKey",
      "hints",
      "stickyKey",
      "actionKey",
      "cancelKey",
    ]),
    settingsClient.matchBlacklist(location.href),
  ]);
  keyboardHandler.setup(setting, matchedBlacklist);
  console.debug("settings loaded");
}
setup().catch(printError);

const RELEVANT_KEYS: (keyof Settings)[] = [
  "magicKey",
  "blurKey",
  "hints",
  "stickyKey",
  "actionKey",
  "cancelKey",
  "blackList",
];

let debounceController: AbortController | null = null;

chrome.storage.onChanged.addListener((changes) => {
  (async () => {
    if (!RELEVANT_KEYS.some((k) => k in changes)) return;
    debounceController?.abort();
    debounceController = new AbortController();
    const { signal } = debounceController;
    do {
      await wait(200, signal);
    } while (hinterClient.isHinting);
    await setup();
  })().catch((e) => {
    if (e instanceof DOMException && e.name === "AbortError") return;
    printError(e);
  });
});

chrome.runtime.onMessage.addListener(
  ChromeMessageRouter.newInstance()
    .add("ExecuteAction", ({ id, options }) =>
      rectAggregator.handleExecuteAction(id.index, options),
    )
    .buildListener(),
);

window.addEventListener(
  "keydown",
  (event) => {
    if (keyboardHandler.handleKeydown(event)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  },
  true,
);
window.addEventListener(
  "keyup",
  (event) => {
    if (keyboardHandler.handleKeyup(event)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  },
  true,
);
window.addEventListener(
  "keypress",
  (event) => {
    if (keyboardHandler.handleKeypress()) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  },
  true,
);

window.addEventListener(
  "message",
  new DOMMessageRouter()
    .add("com.github.kui.knavi.Blur", (e) => {
      // source === window is a relay-to-self (root-frame blur); BlurerContentAll ignores it.
      // For child-frame sources, require the nonce sent in AllRectsRequest to prevent
      // forged Blur messages from third-party or malicious iframes.
      if (e.source !== window && e.data.nonce !== childNonce) {
        console.warn("Blur dropped: invalid nonce from", e.source);
        return;
      }
      blurer.handleBlurMessage(e.source, e.data.rect, parentNonce);
    })
    .add("com.github.kui.knavi.AllRectsRequest", async (e) => {
      // Only accept from our direct parent (or self for the root-frame bootstrap).
      if (e.source !== window.parent && e.source !== window) {
        console.warn("AllRectsRequest dropped: unexpected source", e.source);
        return;
      }
      const { id, viewport, offsets } = e.data;
      await rectAggregator.handleAllRectsRequest(
        id,
        new Rect(viewport),
        new Coordinates(offsets),
      );
    })
    .buildListener(),
);
