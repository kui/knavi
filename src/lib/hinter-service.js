import settingsClient from "./settings-client.js";
import Hinter from "./hinter.js";
import HintsView from "./hint-view.js";
import { recieve } from "./chrome-messages.js";

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
