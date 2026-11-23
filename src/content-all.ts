import { RectAggregatorContentAll as RectAggregator } from "./content-all/rect-aggregator";
import { KeyboardHandlerContentAll as KeyboardHandler } from "./content-all/keyboard-handler";
import { BlurerContentAll as Blurer } from "./content-all/blurer";
import settingsClient from "./lib/settings-client";
import { printError } from "./lib/errors";
import BlurerClient from "./content-all/blurer-client";
import HinterClient from "./lib/hinter-client";
import { Router as ChromeMessageRouter } from "./lib/chrome-messages";
import { Coordinates, Rect } from "./dom/rects";
import { FramePath } from "./content-all/frame-path";
import { SettingsWatcher } from "./content-all/settings-watcher";

globalThis.KNAVI_FILE = "content-all";

const framePath = new FramePath();
window.addEventListener("message", (e) => {
  framePath.handleMessage(e);
});
framePath.reportAtStartup().catch(printError);

const blurerClient = new BlurerClient(framePath);
const hinterClient = new HinterClient();
const keyboardHandler = new KeyboardHandler(blurerClient, hinterClient);
const rectAggregator = new RectAggregator(framePath);
const blurer = new Blurer(framePath);

const settingsWatcher = new SettingsWatcher({
  hinterClient,
  keyboardHandler,
  settingsClient,
  url: () => location.href,
  onLoaded: () => {
    document.documentElement.dataset.knaviReady = "1";
  },
});
settingsWatcher.load().catch(printError);

chrome.storage.onChanged.addListener((changes, areaName) => {
  void settingsWatcher.handleStorageChange(changes, areaName);
});

window.navigation?.addEventListener("navigatesuccess", () => {
  void settingsWatcher.handleNavigateSuccess();
});

chrome.runtime.onMessage.addListener(
  ChromeMessageRouter.newTabInstance()
    .add("ExecuteActionInFrame", ({ id, options }) =>
      rectAggregator.handleExecuteAction(id.index, options),
    )
    .add("AllRectsRequest", async ({ id, targetPath, viewport, offsets }) => {
      if (!framePath.matches(targetPath)) {
        // WHY: the frame tree changed after the path was reported.
        console.warn("AllRectsRequest for another frame:", targetPath);
        return;
      }
      await rectAggregator.handleAllRectsRequest(
        id,
        new Rect(viewport),
        new Coordinates(offsets),
      );
    })
    .add("BlurRelay", ({ targetPath, childSegment, rect }) => {
      blurer.handleBlurRelay(targetPath, childSegment, rect);
    })
    .add("SyncHintingState", ({ active, sessionId }) => {
      if (hinterClient.syncHinting(active, sessionId))
        framePath.handleHintingState(active);
    })
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
