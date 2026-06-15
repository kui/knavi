import { RectAggregatorContentAll as RectAggregator } from "./content-all/rect-aggregator";
import { KeyboardHandlerContentAll as KeyboardHandler } from "./content-all/keyboard-handler";
import { BlurerContentAll as Blurer } from "./content-all/blurer";
import settingsClient from "./lib/settings-client";
import { printError } from "./lib/errors";
import { wait } from "./lib/promises";
import BlurerClient from "./content-all/blurer-client";
import HinterClient from "./lib/hinter-client";
import { Router as ChromeMessageRouter } from "./lib/chrome-messages";
import {
  listenForChildFramesAndRegister,
  registerWithParent,
} from "./dom/frame-registration";

globalThis.KNAVI_FILE = "content-all";

const iframeMap = new Map<number, HTMLIFrameElement>();
listenForChildFramesAndRegister(iframeMap);
registerWithParent().catch(console.warn);

// Keep a port open so background can detect when this frame unloads.
chrome.runtime.connect({ name: "knavi-frame" });

const blurerClient = new BlurerClient();
const hinterClient = new HinterClient();
const keyboardHandler = new KeyboardHandler(blurerClient, hinterClient);
const rectAggregator = new RectAggregator(iframeMap);
const blurer = new Blurer(iframeMap);

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

window.navigation?.addEventListener("navigatesuccess", () => {
  settingsClient
    .matchBlacklist(location.href)
    .then((matched) => keyboardHandler.updateBlacklist(matched))
    .catch(printError);
});

const router = ChromeMessageRouter.newInstance()
  .add("ExecuteAction", ({ id, options }) =>
    rectAggregator.handleExecuteAction(id.index, options),
  )
  .add("FetchFrameRects", () => rectAggregator.handleFetchFrameRects());
if (parent !== window) {
  router.add("BlurRelay", ({ childFrameId, rect }) =>
    blurer.handleBlurRelay(childFrameId, rect),
  );
}
chrome.runtime.onMessage.addListener(router.buildListener());

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
