import * as rectAggregator from "./lib/rect-aggregator-background.ts";
import * as hinter from "./lib/hinter-background.ts";
import * as settings from "./lib/settings-background.ts";

globalThis.KNAVI_FILE = "background";

chrome.runtime.onMessage.addListener(
  rectAggregator.router
    .merge(hinter.router)
    .merge(settings.router)
    .buildListener(),
);
