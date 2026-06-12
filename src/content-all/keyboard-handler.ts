import { KeyHoldMatcher } from "key-input-elements/event-matchers/key-hold";
import Hinter from "../lib/hinter-client";
import Blurer from "./blurer-client";
import { isEditable } from "../dom/elements";
import { isSingleLetter } from "../lib/strings";
import { printError } from "../lib/errors";

// TODO: Factor out the blurer and then rename this class.
export class KeyboardHandlerContentAll {
  private hitMatcher: KeyHoldMatcher | null = null;
  private blurMatcher: KeyHoldMatcher | null = null;
  private stickyMatcher: KeyHoldMatcher | null = null;
  private actionMatcher: KeyHoldMatcher | null = null;
  private cancelMatcher: KeyHoldMatcher | null = null;
  private hintLetters = "";
  private matchedBlacklist: string[] = [];
  // true when hints were attached by magic key hold (fires on keyup);
  // false when attached by sticky key (fires only via actionKey/cancelKey).
  private holdHinting = false;

  constructor(
    private readonly blurer: Blurer,
    private readonly hinter: Hinter,
  ) {}

  setup(
    settings: Pick<
      Settings,
      "magicKey" | "blurKey" | "hints" | "stickyKey" | "actionKey" | "cancelKey"
    >,
    matchedBlacklist: string[],
  ) {
    this.hintLetters = settings.hints;
    this.hitMatcher =
      settings.magicKey === "" ? null : KeyHoldMatcher.parse(settings.magicKey);
    this.blurMatcher =
      settings.blurKey === "" ? null : KeyHoldMatcher.parse(settings.blurKey);
    this.stickyMatcher =
      settings.stickyKey === ""
        ? null
        : KeyHoldMatcher.parse(settings.stickyKey);
    this.actionMatcher =
      settings.actionKey === ""
        ? null
        : KeyHoldMatcher.parse(settings.actionKey);
    this.cancelMatcher =
      settings.cancelKey === ""
        ? null
        : KeyHoldMatcher.parse(settings.cancelKey);
    this.matchedBlacklist = matchedBlacklist;
  }

  // Reset the held-key history of every matcher.
  private resetMatchers() {
    this.hitMatcher?.reset();
    this.blurMatcher?.reset();
    this.stickyMatcher?.reset();
    this.actionMatcher?.reset();
    this.cancelMatcher?.reset();
  }

  // Return true if the event is handled.
  handleKeydown(event: KeyboardEvent): boolean {
    const hitMatcher = this.hitMatcher?.keydown(event);
    const blurMatcher = this.blurMatcher?.keydown(event);
    const stickyMatcher = this.stickyMatcher?.keydown(event);
    const actionMatcher = this.actionMatcher?.keydown(event);
    const cancelMatcher = this.cancelMatcher?.keydown(event);

    if (this.isBlacklisted()) {
      return false;
    }

    if (this.hinter.isHinting) {
      if (cancelMatcher?.match()) {
        const { shiftKey, altKey, ctrlKey, metaKey } = event;
        this.hinter
          .removeHints({ shiftKey, altKey, ctrlKey, metaKey }, false)
          .catch(printError);
        this.endSession();
        return true;
      }
      if (actionMatcher?.match()) {
        const { shiftKey, altKey, ctrlKey, metaKey } = event;
        this.hinter
          .removeHints({ shiftKey, altKey, ctrlKey, metaKey }, true)
          .catch(printError);
        this.endSession();
        return true;
      }
      if (isSingleLetter(event.key) && this.hintLetters.includes(event.key)) {
        this.hinter.hitHint(event.key).catch(printError);
        return true;
      }
      if (hitMatcher?.match()) {
        return true;
      }
    } else {
      if (!isEditing() && hitMatcher?.match()) {
        this.hinter.attachHints().catch(printError);
        this.holdHinting = true;
        return true;
      }
      if (!isEditing() && stickyMatcher?.match()) {
        this.hinter.attachHints().catch(printError);
        this.holdHinting = false;
        return true;
      }
      if (blurMatcher?.match()) {
        return this.blurer.blur();
      }
    }
    return false;
  }

  // Return true if the event is handled.
  handleKeyup(event: KeyboardEvent): boolean {
    const hitMatcher = this.hitMatcher?.keyup(event);
    this.blurMatcher?.keyup(event);
    this.stickyMatcher?.keyup(event);
    this.actionMatcher?.keyup(event);
    this.cancelMatcher?.keyup(event);

    if (this.isBlacklisted()) {
      return false;
    }

    if (this.hinter.isHinting && this.holdHinting && !hitMatcher?.match()) {
      const { shiftKey, altKey, ctrlKey, metaKey } = event;
      this.hinter
        .removeHints({ shiftKey, altKey, ctrlKey, metaKey }, true)
        .catch(printError);
      this.endSession();
      return true;
    }
    return false;
  }

  // End the current hint session. Resetting the matchers clears any key left
  // "held" in their history because its keyup was lost — e.g. an Action Key
  // that fired a target=_blank action and opened a new tab, stealing focus
  // before keyup arrived. Without this, the stuck key would spuriously match on
  // the next session.
  private endSession() {
    this.holdHinting = false;
    this.resetMatchers();
  }

  // Just hijack the event when hinting.
  // Return true if the event is handled.
  handleKeypress() {
    return this.hinter.isHinting;
  }

  private isBlacklisted() {
    return this.matchedBlacklist.length > 0;
  }
}

function isEditing() {
  const e = activeElement();
  return e && isEditable(e);
}

function activeElement(): Element | undefined {
  let e: Element | null = document.activeElement;
  const stack: Element[] = [];
  while (e && !stack.includes(e)) {
    stack.unshift(e);
    e = e.shadowRoot?.activeElement ?? null;
  }
  return stack[0];
}
