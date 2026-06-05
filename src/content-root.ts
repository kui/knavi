import settingsClient from "./lib/settings-client.ts";
import { HinterContentRoot } from "./content-root/hinter.ts";
import { BlurerContentRoot } from "./content-root/blurer.ts";
import { Router as ChromeMessageRouter } from "./lib/chrome-messages.ts";
import { Router as DomMessageRouter } from "./dom/dom-messages.ts";
import { RectAggregatorClient } from "./content-root/rect-aggregator-client.ts";
import { HintView } from "./content-root/hinter-view.ts";
import BlurView from "./content-root/blurer-view.ts";
import { printError } from "./lib/errors.ts";

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
    .add("RemoveHints", ({ options, execute }) =>
      hinter.removeHints(options, execute),
    )
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
