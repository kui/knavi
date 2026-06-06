import * as rectAggregator from "./background/rect-aggregator";
import * as hinter from "./background/hinter";
import * as settings from "./background/settings";

globalThis.KNAVI_FILE = "background";

chrome.runtime.onMessage.addListener(
  rectAggregator.router
    .merge(hinter.router)
    .merge(settings.router)
    .buildListener(),
);
