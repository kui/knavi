import { RectFetcherContentAll as RectFetcher } from "./lib/rect-fetcher-content-all";
import { KeyboardHandlerContentAll as KeyboardHandler } from "./lib/keyboard-handler-content-all";
import { BlurerContentAll as Blurer } from "./lib/blurer-content-all";
import settingsClient from "./lib/settings-client";
import { printError } from "./lib/errors";
import BlurerClient from "./lib/blurer-client";
import HinterClient from "./lib/hinter-client";
import { Router as DOMMessageRouter } from "./lib/dom-messages";
import { Router as ChromeMessageRouter } from "./lib/chrome-messages";
import { Coordinates, Rect } from "./lib/rects";

globalThis.KNAVI_FILE = "content-all";

const blurerClient = new BlurerClient();
const hinterClient = new HinterClient();
const keyboardHandler = new KeyboardHandler(blurerClient, hinterClient);
const rectFetcher = new RectFetcher();
const blurer = new Blurer();
(async () => {
  const setting = await settingsClient.get(["magicKey", "blurKey", "hints"]);
  await keyboardHandler.setup(setting);
  console.debug("settings loaded");
})().catch(printError);

chrome.runtime.onMessage.addListener(
  ChromeMessageRouter.newInstance()
    .merge(
      settingsClient.subscribeRouter(async (settings) => {
        await keyboardHandler.setup(settings);
      }),
    )
    .add("GetDescriptions", ({ id }) =>
      rectFetcher.handleGetDescription(id.index),
    )
    .add(
      "ExecuteAction",
      async ({ id, options }) =>
        await rectFetcher.handleExecuteAction(id.index, options),
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
    .add("com.github.kui.knavi.Blur", (e) =>
      blurer.handleBlurMessage(e.source, e.data.rect),
    )
    .add("com.github.kui.knavi.AllRectsRequest", async (e) => {
      const { id, viewport, offsets } = e.data;
      await rectFetcher.handleAllRectsRequest(
        id,
        new Rect(viewport),
        new Coordinates(offsets),
      );
    })
    .buildListener(),
);
