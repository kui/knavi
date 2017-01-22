// @flow

import "./lib/rect-fetcher-service";
import EventMatcher from "key-input-elements/lib/event-matcher";
import settings from "./lib/settings";
import * as utils from "./lib/utils";
import HinterClient from "./lib/hinter-client";
import Blurer from "./lib/blurer";
import BlurView from "./lib/blur-view";

async function main() {
  let hinter: HinterClient;
  let hitEventMatcher: EventMatcher;
  let blurEventMatcher: EventMatcher;

  await settings.listen((settingValues) => {
    hitEventMatcher = new EventMatcher(settingValues.magicKey);
    hinter = new HinterClient;
    blurEventMatcher = new EventMatcher(settingValues.blurKey);
  });

  const blurer = new Blurer;
  new BlurView(blurer);

  function hookKeydown(event: KeyboardEvent) {
    if (hinter.isHinting) {
      event.preventDefault();
      event.stopPropagation();
      hinter.hitHint(event.key);
      return;
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
    if (hinter.isHinting && hitEventMatcher.testModInsensitive(event)) {
      event.preventDefault();
      event.stopPropagation();
      const { shiftKey, altKey, ctrlKey, metaKey } = event;
      hinter.removeHints({ shiftKey, altKey, ctrlKey, metaKey });
      return;
    }
  }
  function hookKeypress(event: KeyboardEvent) {
    if (hinter.isHinting) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
  }

  window.addEventListener("keydown", hookKeydown, true);
  window.addEventListener("keyup", hookKeyup, true);
  window.addEventListener("keypress", hookKeypress, true);
}

main();
