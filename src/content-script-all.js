// @flow

import "./lib/rect-fetcher-service";
import EventMatcher from "key-input-elements/lib/event-matcher";
import settingsClient from "./lib/settings-client";
import * as utils from "./lib/utils";
import HinterClient from "./lib/hinter-client";
import Blurer from "./lib/blurer";
import BlurView from "./lib/blur-view";

async function main() {
  let hitEventMatcher: EventMatcher;
  let blurEventMatcher: EventMatcher;

  const hinter = new HinterClient;
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

  let isEnabledKeyhooks = false;

  function enableKeyhooks() {
    if (isEnabledKeyhooks) return;
    isEnabledKeyhooks = true;
    window.addEventListener("keydown", hookKeydown, true);
    window.addEventListener("keyup", hookKeyup, true);
    window.addEventListener("keypress", hookKeypress, true);
  }

  function disableKeyhooks() {
    if (!isEnabledKeyhooks) return;
    isEnabledKeyhooks = false;
    window.removeEventListener("keydown", hookKeydown, true);
    window.removeEventListener("keyup", hookKeyup, true);
    window.removeEventListener("keypress", hookKeypress, true);
  }

  const settings = await settingsClient.get();
  hitEventMatcher = new EventMatcher(settings.magicKey);
  blurEventMatcher = new EventMatcher(settings.blurKey);

  if (await settingsClient.isBlackListed(location.href)) {
    console.debug("Blacklisted page");
  } else {
    enableKeyhooks();
  }

  settingsClient.subscribe(async (settings) => {
    hitEventMatcher = new EventMatcher(settings.magicKey);
    blurEventMatcher = new EventMatcher(settings.blurKey);
    if (await settingsClient.isBlackListed(location.href)) {
      console.debug("Blacklisted page");
      disableKeyhooks();
    } else {
      enableKeyhooks();
    }
  });
}

main();
