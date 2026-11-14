import settingsClient from "./lib/settings-client";
import { HinterContentRoot } from "./content-root/hinter";
import { BlurerContentRoot } from "./content-root/blurer";
import { Router as ChromeMessageRouter } from "./lib/chrome-messages";
import { RectAggregatorClient } from "./content-root/rect-aggregator-client";
import {
  SettingsLoader,
  isRelevantChange,
} from "./content-root/settings-loader";
import { HintView } from "./content-root/hinter-view";
import BlurView from "./content-root/blurer-view";
import { printError } from "./lib/errors";

globalThis.KNAVI_FILE = "content-root";

const rectAggregator = new RectAggregatorClient();
const hinterView = new HintView();
const hinter = new HinterContentRoot(rectAggregator, hinterView);

const blurerView = new BlurView();
const blurer = new BlurerContentRoot(blurerView);

const settingsLoader = new SettingsLoader(
  () => settingsClient.get(["css", "hints", "cycleKey"]),
  ({ css, hints, cycleKey }) => {
    hinterView.setCss(css);
    hinterView.setCycleKey(cycleKey);
    hinter.setup(hints);
  },
);
settingsLoader.load().catch(printError);

chrome.storage.onChanged.addListener((changes) => {
  if (isRelevantChange(changes)) settingsLoader.load().catch(printError);
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
