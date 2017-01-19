// @flow

import EventMatcher from "key-input-elements/lib/event-matcher";
import settings from "./lib/settings";
import * as utils from "./lib/utils";

import Hinter from "./lib/hinter";
import HintsView from "./lib/hint-view";
import ActionHandler from "./lib/action-handlers";

import Blurer from "./lib/blurer";
import BlurView from "./lib/blur-view";

let css: string;
let actionHandler: ActionHandler;
let hinter: Hinter;
let hitEventMatcher: EventMatcher;

let blurer: Blurer;
let blurEventMatcher: EventMatcher;

async function main() {
  const settingValues = await settings.load();
  console.debug("config: ", settingValues);

  hitEventMatcher = new EventMatcher(settingValues.magicKey);
  actionHandler = new ActionHandler;
  hinter = new Hinter(settingValues.hints, actionHandler);
  css = settingValues.css;

  blurEventMatcher = new EventMatcher(settingValues.blurKey);
  blurer = new Blurer;

  // wait event setup untill document.body.firstChild is reachable.
  while (!(document.body && document.body.firstChild)) await utils.nextAnimationFrame();

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
