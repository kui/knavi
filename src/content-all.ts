import { RectAggregatorContentAll as RectAggregator } from "./content-all/rect-aggregator";
import { KeyboardHandlerContentAll as KeyboardHandler } from "./content-all/keyboard-handler";
import { BlurerContentAll as Blurer } from "./content-all/blurer";
import settingsClient from "./lib/settings-client";
import { printError } from "./lib/errors";
import { wait } from "./lib/promises";
import BlurerClient from "./content-all/blurer-client";
import HinterClient from "./lib/hinter-client";
import { Router as ChromeMessageRouter } from "./lib/chrome-messages";
import { Coordinates, Rect } from "./dom/rects";
import { FrameRegistry } from "./content-all/frame-registration";

globalThis.KNAVI_FILE = "content-all";

const frameRegistry = new FrameRegistry();
window.addEventListener("message", frameRegistry.handleMessage);

const blurerClient = new BlurerClient(frameRegistry);
const hinterClient = new HinterClient();
const keyboardHandler = new KeyboardHandler(blurerClient, hinterClient);
const rectAggregator = new RectAggregator(frameRegistry);
const blurer = new Blurer(frameRegistry);

async function setupKeyboardHandler() {
  const [setting, matchedBlacklist] = await Promise.all([
    settingsClient.get([
      "magicKey",
      "blurKey",
      "hints",
      "stickyKey",
      "actionKey",
      "cancelKey",
      "cycleKey",
    ]),
    settingsClient.matchBlacklist(location.href),
  ]);
  keyboardHandler.setup(setting, matchedBlacklist);
  console.debug("settings loaded");
  document.documentElement.dataset.knaviReady = "1";
}
setupKeyboardHandler().catch(printError);

const RELEVANT_KEYS: (keyof Settings)[] = [
  "magicKey",
  "blurKey",
  "hints",
  "stickyKey",
  "actionKey",
  "cancelKey",
  "cycleKey",
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
    await setupKeyboardHandler();
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

chrome.runtime.onMessage.addListener(
  ChromeMessageRouter.newTabInstance()
    .add("ExecuteActionInFrame", ({ id, options }) =>
      rectAggregator.handleExecuteAction(id.index, options),
    )
    .add("AllRectsRequest", async ({ id, viewport, offsets }) => {
      await rectAggregator.handleAllRectsRequest(
        id,
        new Rect(viewport),
        new Coordinates(offsets),
      );
    })
    .add("BlurRelay", ({ childFrameId, rect }) => {
      blurer.handleBlurRelay(childFrameId, rect);
    })
    .add("SyncHintingState", ({ active }) => hinterClient.syncHinting(active))
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
window.addEventListener("blur", () => {
  keyboardHandler.handleBlur();
});
