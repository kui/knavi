// @flow

// import type { AttachHints, RemoveHints, HitHint } from "./hinter-client";
import { recieve, sendTo } from "./message-passing";

// Proxy messages to the root frame.
["AttachHints", "RemoveHints", "HitHint"].forEach((type) => {
  recieve(type, (msg: { type: string }, sender) => {
    sendTo(msg, sender.tab.id, 0);
  });
});
