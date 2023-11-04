import "./lib/rect-fetcher-service.js";
import * as em from "key-input-elements/lib/event-matcher.js";
import settingsClient from "./lib/settings-client.js";
import * as utils from "./lib/utils.js";
import HinterClient from "./lib/hinter-client.js";
import Blurer from "./lib/blurer.js";

// workaround weird babel transpile
const EventMatcher = em.default.default;

async function main() {
  let hitEventMatcher;
  let blurEventMatcher;

  const hinter = new HinterClient();
  const blurer = new Blurer();

  let isEnabledKeyhooks = false;
  let hintLetters;

  const settings = await settingsClient.get();
  hintLetters = settings.hints;
  hitEventMatcher = new EventMatcher(settings.magicKey);
  blurEventMatcher = settings.blurKey
    ? new EventMatcher(settings.blurKey)
    : null;

  const matchedBlacklist = await settingsClient.getMatchedBlackList(
    location.href,
  );
  if (matchedBlacklist.length === 0) {
    enableKeyhooks();
  } else {
    console.debug("Blacklisted page: ", matchedBlacklist);
    disableKeyhooks();
  }

  settingsClient.subscribe(async (settings) => {
    hintLetters = settings.hints;
    hitEventMatcher = new EventMatcher(settings.magicKey);
    blurEventMatcher = new EventMatcher(settings.blurKey);
    const matchedBlacklist = await settingsClient.getMatchedBlackList(
      location.href,
    );
    if (matchedBlacklist.length === 0) {
      enableKeyhooks();
    } else {
      console.debug("Blacklisted page: ", matchedBlacklist);
      disableKeyhooks();
    }
  });

  function hookKeydown(event) {
    if (hinter.isHinting) {
      if (hintLetters.includes(event.key)) {
        event.preventDefault();
        event.stopPropagation();
        hinter.hitHint(event.key);
      } else if (hitEventMatcher.test(event)) {
        event.preventDefault();
        event.stopPropagation();
      }
    } else {
      if (!utils.isEditable(event.target) && hitEventMatcher.test(event)) {
        event.preventDefault();
        event.stopPropagation();
        hinter.attachHints();
      } else if (blurEventMatcher && blurEventMatcher.test(event)) {
        blurer.blur();
      }
    }
  }
  function hookKeyup(event) {
    if (hinter.isHinting && hitEventMatcher.testModInsensitive(event)) {
      event.preventDefault();
      event.stopPropagation();
      const { shiftKey, altKey, ctrlKey, metaKey } = event;
      hinter.removeHints({ shiftKey, altKey, ctrlKey, metaKey });
      return;
    }
  }
  function hookKeypress(event) {
    if (hinter.isHinting) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
  }

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
}

main();
