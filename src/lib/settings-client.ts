import { sendToRuntime, Router } from "./chrome-messages";

export default {
  get<K extends keyof Settings>(names: K[]): Promise<Pick<Settings, K>> {
    return sendToRuntime("GetSettings", { names });
  },
  matchBlacklist(url: string): Promise<string[]> {
    return sendToRuntime("MatchBlacklist", { url });
  },
  matchAdditionalSelectors(url: string): Promise<string[]> {
    return sendToRuntime("MatchAdditionalSelectors", { url });
  },
  subscribeRouter(handler: (settings: Settings) => void | Promise<void>) {
    return Router.newInstance().add("BroadcastNewSettings", handler);
  },
};
