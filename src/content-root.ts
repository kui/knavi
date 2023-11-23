import settingsClient from "./lib/settings-client";
import * as hinterService from "./lib/hinter-service";
import * as blurerService from "./lib/blurer-service";
import { Router } from "./lib/chrome-messages";

chrome.runtime.onMessage.addListener(
  Router.newInstance()
    .merge(
      settingsClient.subscribeRouter((settings) => {
        hinterService.setup(settings.hints, settings.css);
      }),
    )
    .merge(hinterService.router)
    .merge(blurerService.router)
    .buildListener(),
);
window.addEventListener("message", hinterService.handleMessage);
