// @flow

import settingsClient from "./settings-client";
import Hinter from "./hinter";
import HintsView from "./hint-view";

import type { RemoveHints, HitHint } from "./hinter-client";

(async () => {
  let hinter: Hinter;

  const settings = await settingsClient.get();
  hinter = new Hinter(settings.hints);
  new HintsView(hinter, settings.css);

  settingsClient.subscribe((settings) => {
    hinter = new Hinter(settings.hints);
    new HintsView(hinter, settings.css);
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
