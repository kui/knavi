import { config, local } from "./lib/config";

const DEFAULT_STYLE = `
/* base overlay */
#jp-k-ui-knavi-overlay {
  background-color: black;
  border: 1px solid white;
  opacity: 0.2;
  transition-property: left, top, width, height;
  transition-duration: 0.4s;
}

/* hit target overlay */
#jp-k-ui-knavi-active-overlay {
  background-color: red;
  border: 1px solid white;
  opacity: 0.1;
  transition-property: left, top, width, height;
  transition-duration: 0.2s;
}

/* \`#jp-k-ui-knavi-wrapper\` wraps hint elements */
#jp-k-ui-knavi-wrapper > div {
  margin: 0px;
  padding: 3px;
  background-color: black;
  color: white;
  border: white solid 1px;
  line-height: 1em;
  font-size: 16px;
  font-family: monospace;
}
#jp-k-ui-knavi-wrapper > div.jp-k-ui-knavi-disabled {
  opacity: 0.6;
}
#jp-k-ui-knavi-wrapper > div.jp-k-ui-knavi-candidate {
  background-color: yellow;
  color: black;
  border: black solid 1px;
}
#jp-k-ui-knavi-wrapper > div.jp-k-ui-knavi-hit {
  background-color: #c00;
  color: white;
  border: black solid 1px;
  font-weight: bold;
}`;
const DEFAULT_VALUES = new Map([
  ["magic-key", "Space"],
  ["hints", "ASDFGHJKL"],
  ["blur-key", ""],
  ["css", DEFAULT_STYLE],
]);

async function init() {
  await initArea();
  await Promise.all(Array.from(DEFAULT_VALUES.entries()).map(([n, v]) => initValue(n, v)));
}

async function initArea() {
  await initValueByStorage(local, "_area", "chrome-sync");
}

async function initValue(name: string, defaultValue: string) {
  await initValueByStorage(config, name, defaultValue);
}

async function initValueByStorage(storage: local | config, name: string, defaultValue: string) {
  console.log(storage.storage);
  console.log(storage.getStorage && await storage.getStorage());
  const v = await storage.getSingle(name);
  if (v == null) {
    console.log("Init value: %o=%o", name, defaultValue);
    await storage.setSingle(name, defaultValue);
  } else {
    console.log("Already value set: %o=%o", name, v);
  }
}

init().then(() => console.log("Done init"));
