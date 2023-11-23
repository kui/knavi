import { recieve, sendTo } from "./chrome-messages.js";

// Proxy to root frame in self tab.
recieve("Blured", (msg, sender) => {
  sendTo(msg, sender.tab.id, 0);
});
