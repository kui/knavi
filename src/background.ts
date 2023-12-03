import * as rectFetcher from "./lib/rect-fetcher-background";
import * as hinter from "./lib/hinter-background";
import * as settings from "./lib/settings-background";

globalThis.KNAVI_FILE = "background";

chrome.runtime.onMessage.addListener(
  rectFetcher.router
    .merge(hinter.router)
    .merge(settings.router)
    .buildListener(),
);
