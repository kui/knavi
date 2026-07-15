import settingsClient from "./lib/settings-client";
import { HinterContentRoot } from "./content-root/hinter";
import { BlurerContentRoot } from "./content-root/blurer";
import { Router as ChromeMessageRouter } from "./lib/chrome-messages";
import { RectAggregatorClient } from "./content-root/rect-aggregator-client";
import { HintView } from "./content-root/hinter-view";
import BlurView from "./content-root/blurer-view";
import { printError } from "./lib/errors";

globalThis.KNAVI_FILE = "content-root";

const rectAggregator = new RectAggregatorClient();
const hinterView = new HintView();
const hinter = new HinterContentRoot(rectAggregator, hinterView);

const blurerView = new BlurView();
const blurer = new BlurerContentRoot(blurerView);

(async () => {
  const { css, hints, cycleKey } = await settingsClient.get([
    "css",
    "hints",
    "cycleKey",
  ]);
  hinterView.setCss(css);
  hinterView.setCycleKey(cycleKey);
  hinter.setup(hints);
})().catch(printError);

chrome.storage.onChanged.addListener((changes) => {
  if (changes.css) {
    hinterView.setCss(changes.css.newValue as Settings["css"]);
  }
  if (changes.cycleKey) {
    hinterView.setCycleKey(changes.cycleKey.newValue as Settings["cycleKey"]);
  }
  if (changes.hints) {
    hinter.setup(changes.hints.newValue as Settings["hints"]);
  }
});

chrome.runtime.onMessage.addListener(
  ChromeMessageRouter.newTabInstance()
    .add("ResponseRectsFragment", (m) =>
      rectAggregator.handleRects(m.requestId, m.rects),
    )
    .add("AttachHintsInTab", () => hinter.attachHints())
    .add("HitHintInTab", ({ key }) => hinter.hitHint(key))
    .add("CycleHintInTab", () => hinter.cycleHint())
    .add("RemoveHintsInTab", ({ options, execute }) =>
      hinter.removeHints(options, execute),
    )
    .add("BlurRoot", ({ rect }) => blurer.handleBlurRoot(rect))
    .buildListener(),
);
