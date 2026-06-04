import * as rectAggregator from "./background/rect-aggregator.ts";
import * as hinter from "./background/hinter.ts";
import * as settings from "./background/settings.ts";

globalThis.KNAVI_FILE = "background";

chrome.runtime.onMessage.addListener(
  rectAggregator.router
    .merge(hinter.router)
    .merge(settings.router)
    .buildListener(),
);
