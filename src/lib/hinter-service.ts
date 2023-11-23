import settingsClient from "./settings-client";
import { Hinter } from "./hinter";
import { RectFetcherClient } from "./rect-fetcher-client";
import { HintView } from "./hint-view";
import { Router } from "./chrome-messages";

const rectFetcher = new RectFetcherClient();

const hinter = new Hinter(rectFetcher);
const view = new HintView();
(async () => {
  const settings = await settingsClient.get(["hints", "css"]);
  setup(settings.hints, settings.css);
})().catch(console.error);

export function setup(hints: string, css: string) {
  hinter.setup(hints);
  view.setup(css);
}
export const router = Router.newInstance()
  .merge(rectFetcher.router())
  .merge(hinter.router())
  .merge(view.router());
export const handleMessage = (e: MessageEvent<{ type?: string }>) =>
  rectFetcher.handleMessage(e);
