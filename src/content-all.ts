import settingsClient from "./lib/settings-client";
import { RectFetcherService } from "./lib/rect-fetcher-service";
import { KeyboardEventHandler } from "./lib/keyboard-event-handler";
import { printError } from "./lib/errors";

const keyboardEventHandler = new KeyboardEventHandler();
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
window.addEventListener("message", (event: MessageEvent<{ type?: string }>) => {
  keyboardEventHandler.handleMessage(event);
  rectFetcherService.handleMessage(event);
});
