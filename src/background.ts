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

import { Router } from "./lib/chrome-messages";

chrome.runtime.onMessage.addListener(
  Router.newInstance()
    .mergeAll(
      rectAggregator.router,
      hinter.router,
      blurer.router,
      frameRegistry.router,
      settings.router,
    )
    .buildListener(),
);
