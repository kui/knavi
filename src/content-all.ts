import { RectAggregatorContentAll as RectAggregator } from "./content-all/rect-aggregator.ts";
import { KeyboardHandlerContentAll as KeyboardHandler } from "./content-all/keyboard-handler.ts";
import { BlurerContentAll as Blurer } from "./content-all/blurer.ts";
import settingsClient from "./lib/settings-client.ts";
import { printError } from "./lib/errors.ts";
import BlurerClient from "./content-all/blurer-client.ts";
import HinterClient from "./lib/hinter-client.ts";
import { Router as DOMMessageRouter } from "./dom/dom-messages.ts";
import { Router as ChromeMessageRouter } from "./lib/chrome-messages.ts";
import { Coordinates, Rect } from "./dom/rects.ts";

globalThis.KNAVI_FILE = "content-all";

const blurerClient = new BlurerClient();
const hinterClient = new HinterClient();
const keyboardHandler = new KeyboardHandler(blurerClient, hinterClient);
const rectAggregator = new RectAggregator();
const blurer = new Blurer();

async function setup() {
  const setting = await settingsClient.get(["magicKey", "blurKey", "hints"]);
  await keyboardHandler.setup(setting);
  console.debug("settings loaded");
}
setup().catch(printError);

chrome.storage.onChanged.addListener(() => {
  setup().catch(printError);
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
    .add("com.github.kui.knavi.Blur", (e) =>
      blurer.handleBlurMessage(e.source, e.data.rect),
    )
    .add("com.github.kui.knavi.AllRectsRequest", async (e) => {
      const { id, viewport, offsets } = e.data;
      await rectAggregator.handleAllRectsRequest(
        id,
        new Rect(viewport),
        new Coordinates(offsets),
      );
    })
    .buildListener(),
);
