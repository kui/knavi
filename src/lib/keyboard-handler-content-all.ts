import { KeyHoldMatcher } from "key-input-elements/event-matchers/key-hold";
import settingsClient from "./settings-client";
import Hinter from "./hinter-client";
import Blurer from "./blurer-client";
import { isEditable } from "./elements";
import { isSingleLetter } from "./strings";
import { printError } from "./errors";

// TODO: Factor out the blurer and then rename this class.
export class KeyboardHandlerContentAll {
  private hitMatcher: KeyHoldMatcher | null = null;
  private blurMatcher: KeyHoldMatcher | null = null;
  private hintLetters = "";
  private matchedBlacklist: string[] = [];

  constructor(
    private readonly blurer: Blurer,
    private readonly hinter: Hinter,
  ) {}

  async setup(settings: Pick<Settings, "magicKey" | "blurKey" | "hints">) {
    this.hintLetters = settings.hints;
    this.hitMatcher =
      settings.magicKey === "" ? null : KeyHoldMatcher.parse(settings.magicKey);
    this.blurMatcher =
      settings.blurKey === "" ? null : KeyHoldMatcher.parse(settings.blurKey);
    this.matchedBlacklist = await settingsClient.matchBlacklist(location.href);
  }

  // Return true if the event is handled.
  handleKeydown(event: KeyboardEvent): boolean {
    const hitMatcher = this.hitMatcher?.keydown(event);
    const blurMatcher = this.blurMatcher?.keydown(event);

    if (this.isBlacklisted()) {
      return false;
    }

    if (this.hinter.isHinting) {
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

    if (this.isBlacklisted()) {
      return false;
    }

    if (this.hinter.isHinting && !hitMatcher?.match()) {
      const { shiftKey, altKey, ctrlKey, metaKey } = event;
      this.hinter
        .removeHints({ shiftKey, altKey, ctrlKey, metaKey })
        .catch(printError);
      return true;
    }
    return false;
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
