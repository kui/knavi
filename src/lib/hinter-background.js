

// import type { AttachHints, RemoveHints, HitHint } from "./hinter-client";
import { recieve, sendTo } from "./chrome-messages";

// Proxy messages to the root frame from hinter-client.
["AttachHints", "RemoveHints", "HitHint"].forEach(type => {
  recieve(type, (msg, sender) => sendTo(msg, sender.tab.id, 0));
});

// Proxy messages to the root frame from hinter.
["StartHinting", "NewTargets", "EndHinting", "AfterHitHint", "AfterRemoveHints"].forEach(type => {
  recieve(type, (msg, sender) => sendTo(msg, sender.tab.id, 0));
});