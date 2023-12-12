import settingsClient from "./lib/settings-client";
import { HinterContentRoot } from "./lib/hinter-content-root";
import { BlurerContentRoot } from "./lib/blurer-content-root";
import { Router as ChromeMessageRouter } from "./lib/chrome-messages";
import { Router as DomMessageRouter } from "./lib/dom-messages";
import { RectAggregatorClient } from "./lib/rect-aggregator-client";
import { HintView } from "./lib/hinter-view";
import BlurView from "./lib/blurer-view";
import { printError } from "./lib/errors";

globalThis.KNAVI_FILE = "content-root";

const rectAggregator = new RectAggregatorClient();
const hinterView = new HintView();
const hinter = new HinterContentRoot(rectAggregator, hinterView);

const blurerView = new BlurView();
const blurer = new BlurerContentRoot(blurerView);

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
    .add("ResponseRectsFragment", (m) =>
      rectAggregator.handleRects(m.requestId, m.rects),
    )
    .add("AttachHints", () => hinter.attachHints())
    .add("HitHint", ({ key }) => hinter.hitHint(key))
    .add("RemoveHints", ({ options }) => hinter.removeHints(options))
    .buildListener(),
);

addEventListener(
  "message",
  new DomMessageRouter()
    .add("com.github.kui.knavi.Blur", ({ source, data }) =>
      blurer.handleBlurMessage(source, data.rect),
    )
    .buildListener(),
);
