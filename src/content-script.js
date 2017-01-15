// @flow

import EventMatcher from "key-input-elements/lib/event-matcher";
import { config } from "./lib/config";
import * as utils from "./lib/utils";

import Hinter from "./lib/hinter";
import HintsView from "./lib/hint-view";

import Blurer from "./lib/blurer";
import BlurView from "./lib/blur-view";

const DEFAULT_MAGIC_KEY = "Space";
const DEFAULT_HINTS = "ASDFGHJKL";
const DEFAULT_STYLE = `
#jp-k-ui-knavi-overlay {
  background-color: black;
  border: 1px solid white;
  opacity: 0.2;
  transition-property: left, top, width, height;
  transition-duration: 0.4s;
  /* transition-timing-function: ease-in; */
}
#jp-k-ui-knavi-active-overlay {
  background-color: red;
  border: 1px solid white;
  opacity: 0.1;
  transition-property: left, top, width, height;
  transition-duration: 0.2s;
}
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
}`.replace(/(^|\n)\t+/g, "$1");

let hitEventMatcher: EventMatcher;
let blurEventMatcher: EventMatcher;
let hinter: Hinter;
let blurer: Blurer;
let css: string;

async function main() {
  const configValues = await config.get();
  console.debug("config: ", configValues);

  hitEventMatcher = new EventMatcher(configValues["magic-key"] || DEFAULT_MAGIC_KEY);
  blurEventMatcher = new EventMatcher(configValues["blur-key"] || "");
  hinter = new Hinter(configValues["hints"] || DEFAULT_HINTS);
  blurer = new Blurer();
  css = configValues["css"] || DEFAULT_STYLE;

  // wait event setup untill document.body.firstChild is reachable.
  while (!(document.body && document.body.firstChild)) await utils.nextTick();

  setupEvents();
}

function setupEvents() {
  function hookKeydown(event: KeyboardEvent) {
    if (hinter.isHinting()) {
      event.preventDefault();
      event.stopPropagation();
      hinter.hitHint(event.key);
    } else {
      if (!utils.isEditable(event.target) && hitEventMatcher.test(event)) {
        event.preventDefault();
        event.stopPropagation();
        hinter.attachHints();
      } else if (blurEventMatcher.test(event)) {
        blurer.blur();
      }
      return;
    }
  }
  function hookKeyup(event: KeyboardEvent) {
    if (hinter.isHinting() && hitEventMatcher.testModInsensitive(event)) {
      event.preventDefault();
      event.stopPropagation();
      hinter.removeHints(event);
    }
  }
  function hookKeypress(event: KeyboardEvent) {
    if (hinter.isHinting()) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  window.addEventListener("keydown", hookKeydown, true);
  window.addEventListener("keyup", hookKeyup, true);
  window.addEventListener("keypress", hookKeypress, true);

  new HintsView(hinter, css);
  new BlurView(blurer);
}

main();
