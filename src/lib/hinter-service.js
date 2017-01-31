// @flow

import settingsClient from "./settings-client";
import Hinter from "./hinter";
import HintsView from "./hint-view";
import { recieve } from "./chrome-messages";

import type {
  // AttachHints,
  RemoveHints,
  HitHint,
} from "./hinter-client";

new HintsView();

(async () => {
  let hinter: Hinter;
  const settings = await settingsClient.get();
  hinter = new Hinter(settings.hints);
  settingsClient.subscribe((settings) => {
    hinter = new Hinter(settings.hints);
  });

  recieve("AttachHints", () => hinter.attachHints());
  recieve("RemoveHints", ({ options }: RemoveHints) => hinter.removeHints(options));
  recieve("HitHint", ({ key }: HitHint) => hinter.hitHint(key));
})();
