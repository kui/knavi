// @flow

import settings from "./settings";
import Hinter from "./hinter";
import HintsView from "./hint-view";

import type { RemoveHints, HitHint } from "./hinter-client";

(async () => {
  let hinter: Hinter;
  await settings.listen((settingValues) => {
    hinter = new Hinter(settingValues.hints);
    new HintsView(hinter, settingValues.css);
  });

  chrome.runtime.onMessage.addListener((message) => {
    switch (message.type) {
    case "AttachHints":
      hinter.attachHints();
      return true;
    case "RemoveHints":
      const { options }: RemoveHints = message;
      hinter.removeHints(options);
      return true;
    case "HitHint":
      const { key }: HitHint = message;
      hinter.hitHint(key);
      return true;
    }
  });
})();
