import settingsClient from "./settings-client";
import Hinter from "./hinter";
import HintsView from "./hint-view";
import { recieve } from "./chrome-messages";

new HintsView();

(async () => {
  let hinter;
  const settings = await settingsClient.get();
  hinter = new Hinter(settings.hints);
  settingsClient.subscribe(settings => {
    hinter = new Hinter(settings.hints);
  });

  recieve("AttachHints", () => hinter.attachHints());
  recieve("RemoveHints", ({ options }) => hinter.removeHints(options));
  recieve("HitHint", ({ key }) => hinter.hitHint(key));
})();
