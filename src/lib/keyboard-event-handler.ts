import * as em from "key-input-elements/lib/event-matcher.js";
import settingsClient from "./settings-client";
import HinterClient from "./hinter-client";
import Blurer from "./blurer";
import { isEditable } from "./elements";
import { isSigleLetter } from "./strings";

// workaround weird babel transpile
const KeyboardEventMatcherImpl = em.default
  .default as unknown as typeof KeyboardEventMatcher;

export class KeyboardEventHandler {
  private readonly hinter = new HinterClient();
  private readonly blurer = new Blurer();
  private hitMatcher: KeyboardEventMatcher | null = null;
  private blurMatcher: KeyboardEventMatcher | null = null;
  private hintLetters = "";
  private matchedBlacklist: string[] = [];

  async setup(settings: Pick<Settings, "magicKey" | "blurKey" | "hints">) {
    this.hintLetters = settings.hints;
    this.hitMatcher = new KeyboardEventMatcherImpl(settings.magicKey);
    this.blurMatcher = new KeyboardEventMatcherImpl(settings.blurKey);
    this.matchedBlacklist = await settingsClient.matchBlacklist(location.href);
  }

  // Return true if the event is handled.
  handleKeydown(event: KeyboardEvent) {
    if (this.isBlacklisted()) {
      return false;
    }
    if (this.hitMatcher == null || this.blurMatcher == null) {
      throw Error("Not initialized");
    }
    if (this.hinter.isHinting) {
      if (isSigleLetter(event.key) && this.hintLetters.includes(event.key)) {
        this.hinter.hitHint(event.key).catch(console.error);
        return true;
      }
      if (this.hitMatcher.test(event)) {
        return true;
      }
    } else {
      if (isNonEditable(event.target) && this.hitMatcher.test(event)) {
        this.hinter.attachHints().catch(console.error);
        return true;
      }
      if (this.blurMatcher.test(event)) {
        return this.blurer.blur();
      }
    }
    return false;
  }

  // Return true if the event is handled.
  handleKeyup(event: KeyboardEvent) {
    if (this.isBlacklisted()) {
      return false;
    }
    if (this.hitMatcher == null) {
      throw Error("Not initialized");
    }
    if (this.hinter.isHinting && this.hitMatcher.testModInsensitive(event)) {
      const { shiftKey, altKey, ctrlKey, metaKey } = event;
      this.hinter
        .removeHints({ shiftKey, altKey, ctrlKey, metaKey })
        .catch(console.error);
      return true;
    }
    return false;
  }

  // Just hijack the event when hinting.
  // Return true if the event is handled.
  handleKeypress() {
    return this.hinter.isHinting;
  }

  handleMessage(event: MessageEvent<{ type?: string }>) {
    this.blurer.handleMessageEvent(event);
  }

  private isBlacklisted() {
    return this.matchedBlacklist.length > 0;
  }
}
function isNonEditable(target: EventTarget | null): boolean {
  return target != null && !isEditable(target);
}
