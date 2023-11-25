import settingsClient from "./lib/settings-client";
import { RectFetcherService } from "./lib/rect-fetcher-service";
import { KeyboardEventHandler } from "./lib/keyboard-event-handler";
import { printError } from "./lib/errors";
import Blurer from "./lib/blurer";
import { Router as DOMMessageRouter } from "./lib/dom-messages";

globalThis.KNAVI_FILE = "content-all";

const blurer = new Blurer();
const keyboardEventHandler = new KeyboardEventHandler(blurer);
(async () => {
  const setting = await settingsClient.get(["magicKey", "blurKey", "hints"]);
  await keyboardEventHandler.setup(setting);
  console.debug("settings loaded");
})().catch(printError);

const rectFetcherService = new RectFetcherService();

const router = rectFetcherService.router().merge(
  settingsClient.subscribeRouter(async (settings) => {
    await keyboardEventHandler.setup(settings);
    console.debug("settings changed");
  }),
);
chrome.runtime.onMessage.addListener(router.buildListener());

window.addEventListener(
  "keydown",
  (event) => {
    if (keyboardEventHandler.handleKeydown(event)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  },
  true,
);
window.addEventListener(
  "keyup",
  (event) => {
    if (keyboardEventHandler.handleKeyup(event)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  },
  true,
);
window.addEventListener(
  "keypress",
  (event) => {
    if (keyboardEventHandler.handleKeypress()) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  },
  true,
);

window.addEventListener(
  "message",
  new DOMMessageRouter()
    .add("com.github.kui.knavi.Blur", (e) => blurer.handleBlurMessage(e))
    .add("com.github.kui.knavi.AllRectsRequest", (e) =>
      rectFetcherService.handleAllRectsRequest(e.data),
    )
    .add("com.github.kui.knavi.RegisterFrame", (e) =>
      rectFetcherService.handleRegisterFrame(e),
    )
    .buildListener(),
);
