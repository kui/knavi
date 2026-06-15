import * as rectAggregator from "./background/rect-aggregator";
import * as hinter from "./background/hinter";
import * as blurer from "./background/blurer";
import * as frameRegistry from "./background/frame-registry";
import * as settings from "./background/settings";
import * as migration from "./background/migration";
import * as actionIcon from "./background/action-icon";
import libSettings from "./lib/settings";

globalThis.KNAVI_FILE = "background";

migration.init(libSettings);
actionIcon.init();

chrome.runtime.onMessage.addListener(
  rectAggregator.router
    .merge(hinter.router)
    .merge(blurer.router)
    .merge(frameRegistry.router)
    .merge(settings.router)
    .buildListener(),
);
