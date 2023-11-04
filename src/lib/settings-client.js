import { send, subscribe } from "./chrome-messages.js";

export default {
  get() {
    return send({ type: "GetSettings" });
  },
  subscribe(callback) {
    subscribe("BroadcastNewSettings", (message) => {
      callback(message.settings);
    });
  },
  getMatchedBlackList(url) {
    return send({ type: "GetMatchedBlackList", url });
  },
  getMatchedSelectors(url) {
    return send({ type: "GetMatchedSelectors", url });
  },
};
