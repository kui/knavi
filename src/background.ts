import * as rectFetcher from "./lib/rect-fetcher-background";
import * as hinter from "./lib/hinter-background";
import * as blurer from "./lib/blurer-background";
import * as settings from "./lib/settings-background";

chrome.runtime.onMessage.addListener(
  rectFetcher.router
    .merge(hinter.router)
    .merge(blurer.router)
    .merge(settings.router)
    .buildListener(),
);
