import settingsClient from "./lib/settings-client";
import * as hinterService from "./lib/hinter-service";
import * as blurerService from "./lib/blurer-service";
import { Router as ChromeMessageRouter } from "./lib/chrome-messages";

globalThis.KNAVI_FILE = "content-root";

chrome.runtime.onMessage.addListener(
  ChromeMessageRouter.newInstance()
    .merge(
      settingsClient.subscribeRouter((settings) => {
        hinterService.setup(settings.hints, settings.css);
      }),
    )
    .merge(hinterService.router)
    .merge(blurerService.router)
    .buildListener(),
);
