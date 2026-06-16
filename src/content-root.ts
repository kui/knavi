import settingsClient from "./lib/settings-client";
import { HinterContentRoot } from "./content-root/hinter";
import { BlurerContentRoot } from "./content-root/blurer";
import { Router as ChromeMessageRouter } from "./lib/chrome-messages";
import { RectAggregatorClient } from "./content-root/rect-aggregator-client";
import { HintView } from "./content-root/hinter-view";
import BlurView from "./content-root/blurer-view";
import { printError } from "./lib/errors";
import { listenForChildFramesLocal } from "./dom/frame-registration";

globalThis.KNAVI_FILE = "content-root";

// Maintain a local iframe map for blur rect transforms.
// content-all.ts handles RegisterChildFrame; here we only track the DOM mapping.
const iframeMap = new Map<number, HTMLIFrameElement>();
listenForChildFramesLocal(iframeMap);

const rectAggregator = new RectAggregatorClient();
const hinterView = new HintView();
const hinter = new HinterContentRoot(rectAggregator, hinterView);

const blurerView = new BlurView();
const blurer = new BlurerContentRoot(blurerView, iframeMap);

(async () => {
  const { css, hints } = await settingsClient.get(["css", "hints"]);
  hinterView.setup(css);
  hinter.setup(hints);
})().catch(printError);

chrome.storage.onChanged.addListener((changes) => {
  if (changes.css) {
    hinterView.setup(changes.css.newValue as Settings["css"]);
  }
  if (changes.hints) {
    hinter.setup(changes.hints.newValue as Settings["hints"]);
  }
});

chrome.runtime.onMessage.addListener(
  ChromeMessageRouter.newInstance()
    .add("AttachHints", () => hinter.attachHints())
    .add("HitHint", ({ key }) => hinter.hitHint(key))
    .add("RemoveHints", ({ options, execute }) =>
      hinter.removeHints(options, execute),
    )
    .add("BlurRelay", ({ childFrameId, rect }) =>
      blurer.handleBlurRelay(childFrameId, rect),
    )
    .buildListener(),
);
