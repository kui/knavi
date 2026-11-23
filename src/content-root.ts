import settingsClient from "./lib/settings-client";
import { HinterContentRoot, buildHinterRouter } from "./content-root/hinter";
import { BlurerContentRoot } from "./content-root/blurer";
import { Router as ChromeMessageRouter } from "./lib/chrome-messages";
import { RectAggregatorClient } from "./content-root/rect-aggregator-client";
import { SettingsLoader, ROOT_KEYS } from "./content-root/settings-loader";
import { isRelevantChange } from "./lib/settings-change";
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
  () => settingsClient.get([...ROOT_KEYS]),
  ({ css, hints, cycleKey }) => {
    hinterView.setCss(css);
    hinterView.setCycleKey(cycleKey);
    hinter.setup(hints);
  },
);
settingsLoader.load().catch(printError);

chrome.storage.onChanged.addListener((changes, areaName) => {
  isRelevantChange(changes, areaName, ROOT_KEYS)
    .then((relevant) => (relevant ? settingsLoader.load() : undefined))
    .catch(printError);
});

chrome.runtime.onMessage.addListener(
  ChromeMessageRouter.newTabInstance()
    .add("ResponseRectsFragment", (m) =>
      rectAggregator.handleRects(m.requestId, m.rects),
    )
    .merge(buildHinterRouter(hinter))
    .add("BlurRoot", ({ rect }) => blurer.handleBlurRoot(rect))
    .buildListener(),
);
