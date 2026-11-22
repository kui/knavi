import { KeyHoldMatcher } from "key-input-elements/event-matchers/key-hold";
import Hinter from "../lib/hinter-client";
import Blurer from "./blurer-client";
import { isEditable } from "../dom/elements";
import { isSingleLetter } from "../lib/strings";
import { printError } from "../lib/errors";

type MatcherKey =
  | "magicKey"
  | "blurKey"
  | "stickyKey"
  | "actionKey"
  | "cancelKey"
  | "cycleKey";
type SessionMode = "hold" | "sticky";
type KeySettings = Pick<Settings, MatcherKey | "hints">;

const NO_MODIFIERS: ActionOptions = {
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
};

export class KeyboardHandlerContentAll {
  private settings: KeySettings | null = null;
  private hitMatcher: KeyHoldMatcher | null = null;
  private blurMatcher: KeyHoldMatcher | null = null;
  private stickyMatcher: KeyHoldMatcher | null = null;
  private actionMatcher: KeyHoldMatcher | null = null;
  private cancelMatcher: KeyHoldMatcher | null = null;
  private cycleMatcher: KeyHoldMatcher | null = null;
  private hintLetters = "";
  private matchedBlacklist: string[] = [];
  /**
   * The mode of the session this frame started, or null when this frame did
   * not start the current one. `hinter.isHinting` is tab-wide (synced to every
   * frame); this is per frame. "hold" fires on keyup; "sticky" only via
   * actionKey/cancelKey.
   */
  private startedSession: SessionMode | null = null;

  constructor(
    private readonly blurer: Blurer,
    private readonly hinter: Hinter,
  ) {}

  setup(settings: KeySettings, matchedBlacklist: string[]) {
    const prev = this.settings;
    this.settings = settings;
    /* WHY: a matcher holds the keys currently pressed. Rebuilding it while the
       magic key is held (e.g. the default back-fill right after install fires
       a reload mid-session) would make the next keyup end the session as if
       the magic key were released, so keep it when its pattern is unchanged. */
    const matcher = (key: MatcherKey, current: KeyHoldMatcher | null) => {
      if (prev?.[key] === settings[key]) return current;
      return settings[key] === "" ? null : KeyHoldMatcher.parse(settings[key]);
    };
    this.hintLetters = settings.hints;
    this.hitMatcher = matcher("magicKey", this.hitMatcher);
    this.blurMatcher = matcher("blurKey", this.blurMatcher);
    this.stickyMatcher = matcher("stickyKey", this.stickyMatcher);
    this.actionMatcher = matcher("actionKey", this.actionMatcher);
    this.cancelMatcher = matcher("cancelKey", this.cancelMatcher);
    this.cycleMatcher = matcher("cycleKey", this.cycleMatcher);
    this.matchedBlacklist = matchedBlacklist;
  }

  updateBlacklist(matchedBlacklist: string[]) {
    const startsMatching = !this.isBlacklisted() && matchedBlacklist.length > 0;
    this.matchedBlacklist = matchedBlacklist;
    /* WHY: knavi does nothing on a blacklisted page, so a session that starts
       matching midway (in-page navigation) ends without running the action.
       Only the frame that started it ends it: RemoveHints from another frame
       would bypass that frame's barrier ordering. */
    if (startsMatching && this.startedSession && this.hinter.isHinting) {
      this.cancelSession();
    }
  }

  /**
   * Called right after a "session ended" broadcast was passed to the hinter.
   * A later session started by another frame is synced here as hinting, and
   * this frame must not end it. The hinter ignores the broadcast while this
   * frame's own attach is pending (it is the previous session's late
   * message), so only forget when `isHinting` shows it was applied.
   */
  handleSessionEnded() {
    if (this.hinter.isHinting) return;
    this.startedSession = null;
  }

  private resetMatchers() {
    this.hitMatcher?.reset();
    this.blurMatcher?.reset();
    this.stickyMatcher?.reset();
    this.actionMatcher?.reset();
    this.cancelMatcher?.reset();
    this.cycleMatcher?.reset();
  }

  /** Returns true if the event is handled. */
  handleKeydown(event: KeyboardEvent): boolean {
    const hitMatcher = this.hitMatcher?.keydown(event);
    const blurMatcher = this.blurMatcher?.keydown(event);
    const stickyMatcher = this.stickyMatcher?.keydown(event);
    const actionMatcher = this.actionMatcher?.keydown(event);
    const cancelMatcher = this.cancelMatcher?.keydown(event);
    const cycleMatcher = this.cycleMatcher?.keydown(event);

    if (this.isBlacklisted()) {
      return false;
    }

    if (this.hinter.isHinting) {
      if (cancelMatcher?.match()) {
        const { shiftKey, altKey, ctrlKey, metaKey } = event;
        this.hinter
          .removeHints({ shiftKey, altKey, ctrlKey, metaKey }, false)
          .catch(printError);
        this.forgetSession();
        return true;
      }
      if (actionMatcher?.match()) {
        const { shiftKey, altKey, ctrlKey, metaKey } = event;
        this.hinter
          .removeHints({ shiftKey, altKey, ctrlKey, metaKey }, true)
          .catch(printError);
        this.forgetSession();
        return true;
      }
      if (cycleMatcher?.match()) {
        this.hinter.cycleHint().catch(printError);
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
        this.startedSession = "hold";
        return true;
      }
      if (!isEditing() && stickyMatcher?.match()) {
        this.hinter.attachHints().catch(printError);
        this.startedSession = "sticky";
        return true;
      }
      if (blurMatcher?.match()) {
        return this.blurer.blur();
      }
    }
    return false;
  }

  /** Returns true if the event is handled. */
  handleKeyup(event: KeyboardEvent): boolean {
    const hitMatcher = this.hitMatcher?.keyup(event);
    this.blurMatcher?.keyup(event);
    this.stickyMatcher?.keyup(event);
    this.actionMatcher?.keyup(event);
    this.cancelMatcher?.keyup(event);
    this.cycleMatcher?.keyup(event);

    if (this.isBlacklisted()) {
      return false;
    }

    if (
      this.hinter.isHinting &&
      this.startedSession === "hold" &&
      !hitMatcher?.match()
    ) {
      const { shiftKey, altKey, ctrlKey, metaKey } = event;
      this.hinter
        .removeHints({ shiftKey, altKey, ctrlKey, metaKey }, true)
        .catch(printError);
      this.forgetSession();
      return true;
    }
    return false;
  }

  /**
   * Resetting the matchers clears any key left "held" in their history
   * because its keyup was lost, e.g. an Action Key that fired a
   * target=_blank action and opened a new tab, stealing focus before keyup
   * arrived. Without this, the stuck key would spuriously match on the next
   * session.
   */
  private forgetSession() {
    this.startedSession = null;
    this.resetMatchers();
  }

  /** Removes the hints without running the action, then forgets the session. */
  private cancelSession() {
    this.hinter.removeHints(NO_MODIFIERS, false).catch(printError);
    this.forgetSession();
  }

  /**
   * WHY: a keydown that moves focus out of this frame (e.g. Tab) loses its
   * keyup here, sticking the key in matcher history; a stuck cycle key then
   * swallows every hint letter as a cycle match.
   */
  handleBlur() {
    this.resetMatchers();
  }

  /**
   * Just hijacks the event when hinting.
   * Returns true if the event is handled.
   */
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
