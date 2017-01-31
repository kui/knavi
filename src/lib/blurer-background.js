// @flow

import { recieve, sendTo } from "./chrome-messages";

import type { Blured } from "./blurer";

// Proxy to root frame in self tab.
recieve("Blured", (msg: Blured, sender) => {
  sendTo(msg, sender.tab.id, 0);
});
