import * as rectAggregator from "./lib/rect-aggregator-background";
import * as hinter from "./lib/hinter-background";
import * as settings from "./lib/settings-background";

globalThis.KNAVI_FILE = "background";

chrome.runtime.onMessage.addListener(
  rectAggregator.router
    .merge(hinter.router)
    .merge(settings.router)
    .buildListener(),
);
