import * as rectAggregator from "./background/rect-aggregator";
import * as hinter from "./background/hinter";
import * as settings from "./background/settings";
import * as migration from "./background/migration";
import * as actionIcon from "./background/action-icon";
import * as framePaths from "./background/frame-paths";
import libSettings from "./lib/settings";
import { printError } from "./lib/errors";

globalThis.KNAVI_FILE = "background";

chrome.runtime.onInstalled.addListener((details) => {
  migration.onInstalled(details, libSettings).catch(printError);
});
chrome.tabs.onActivated.addListener(actionIcon.onActivated);
chrome.tabs.onUpdated.addListener(actionIcon.onUpdated);
chrome.storage.onChanged.addListener(actionIcon.onStorageChanged);
chrome.storage.onChanged.addListener(settings.onStorageChanged);
actionIcon.init();

chrome.runtime.onMessage.addListener(
  rectAggregator.router
    .merge(hinter.router)
    .merge(settings.router)
    .buildListener(),
);

chrome.tabs.onRemoved.addListener((tabId) => framePaths.end(tabId));
