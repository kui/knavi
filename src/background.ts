import * as rectAggregator from "./background/rect-aggregator";
import * as hinter from "./background/hinter";
import * as settings from "./background/settings";
import * as migration from "./background/migration";
import * as actionIcon from "./background/action-icon";
import * as frameNonces from "./background/frame-nonces";
import libSettings from "./lib/settings";

globalThis.KNAVI_FILE = "background";

migration.init(libSettings);
actionIcon.init();

chrome.runtime.onMessage.addListener(
  rectAggregator.router
    .merge(hinter.router)
    .merge(settings.router)
    .merge(frameNonces.router)
    .buildListener(),
);
