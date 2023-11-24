import settingsClient from "./lib/settings-client";
import * as hinterService from "./lib/hinter-service";
import * as blurerService from "./lib/blurer-service";
import { Router as ChromeMessageRouter } from "./lib/chrome-messages";
import { Router as DOMMessageRouter } from "./lib/dom-messages";

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

addEventListener(
  "message",
  new DOMMessageRouter()
    .add("com.github.kui.knavi.AllRectsResponseComplete", () => {
      hinterService.rectFetcher.handleAllRectsResponseComplete();
    })
    .buildListener(),
);
