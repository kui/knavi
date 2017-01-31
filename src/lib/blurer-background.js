// @flow

import { recieve, sendTo } from "./message-passing";

import type { Blured } from "./blurer";

// Proxy to root frame in self tab.
recieve("Blured", (msg: Blured, sender) => {
  sendTo(msg, sender.tab.id, 0);
});
