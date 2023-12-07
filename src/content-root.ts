import settingsClient from "./lib/settings-client";
import { HinterContentRoot } from "./lib/hinter-content-root";
import { BlurerContentRoot } from "./lib/blurer-content-root";
import { Router as ChromeMessageRouter } from "./lib/chrome-messages";
import { Router as DomMessageRouter } from "./lib/dom-messages";
import { RectFetcherClient } from "./lib/rect-fetcher-client";
import { HintView } from "./lib/hinter-view";
import BlurView from "./lib/blurer-view";
import { printError } from "./lib/errors";

globalThis.KNAVI_FILE = "content-root";

const fetcher = new RectFetcherClient();
const hinterView = new HintView();
const hinter = new HinterContentRoot(fetcher, hinterView);

const blurerView = new BlurView();
const blurer = new BlurerContentRoot(blurerView);

(async () => {
  const { css, hints } = await settingsClient.get(["css", "hints"]);
  hinterView.setup(css);
  hinter.setup(hints);
})().catch(printError);

chrome.runtime.onMessage.addListener(
  ChromeMessageRouter.newInstance()
    .add("BroadcastNewSettings", ({ hints, css }) => {
      hinter.setup(hints);
      hinterView.setup(css);
    })
    .add("ResponseRectsFragment", (m) =>
      fetcher.handleRects(m.requestId, m.rects),
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