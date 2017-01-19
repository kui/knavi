// @flow

import settings from "./lib/settings";

async function init() {
  await settings.init();
}

init().then(() => console.log("Done init"));
