import { waitUntil } from "../dom/animations";
import { HintView } from "./hinter-view";
import { map, zip } from "../lib/iters";
import type { RectAggregatorClient } from "./rect-aggregator-client";
import type { SingleLetter } from "../lib/strings";
import { Router } from "../lib/chrome-messages";
import type { SessionId } from "../lib/chrome-messages";
import { printError } from "../lib/errors";

interface HintContext {
  id: SessionId;
  /**
   * The hint letters of this session, fixed when rendering starts so that a
   * settings change applies from the next session. Null until then.
   */
  hintLetters: string | null;
  targets: HintedElement[];
  inputSequence: string[];
  hitTarget?: HintedElement | undefined;
  /**
   * Snapshot taken on the first Cycle Key press. Fixed set of targets whose
   * chip rects intersected the originally-hit chip. Repeated presses cycle
   * through it in DOM insertion order; any letter input clears it.
   */
  cycle?: { set: HintedElement[]; index: number } | undefined;
}

export class HinterContentRoot {
  private context: HintContext | null = null;
  private hintLetters = "";
  private lastSessionId: SessionId = 0;
  private isSetUp = false;
  /* WHY: the root frame loads its settings apart from the frame that catches
     the magic key, and right after install that load waits on the slow
     default CSS fetch, so AttachHintsInTab can arrive before setup(). */
  private readonly setupDone = Promise.withResolvers<void>();

  constructor(
    private rectAggregator: RectAggregatorClient,
    private view: HintView,
  ) {}

  setup(hintLetters: string) {
    this.hintLetters = hintLetters;
    this.isSetUp = true;
    this.setupDone.resolve();
  }

  /**
   * Starts a session and returns its id at once; the hints are rendered after
   * that, without being awaited.
   */
  attachHints(): SessionId {
    if (this.context)
      throw Error("Ilegal state invocation: already started hinting");
    if (this.isSetUp && this.hintLetters.length === 0)
      throw Error("Ilegal state invocation: hintLetters is empty");

    /* WHY: ids must keep growing across top-frame documents of a tab,
       including one restored from the back/forward cache, because a
       broadcast of another document can reach this one's frames and frames
       drop ids below the latest they have seen. Taken from the clock,
       assuming it does not step backwards. */
    this.lastSessionId = Math.max(this.lastSessionId + 1, Date.now());
    const context: HintContext = {
      id: this.lastSessionId,
      hintLetters: null,
      inputSequence: [],
      targets: [],
    };
    this.context = context;
    /* WHY: the session is ended only by RemoveHints, so a failure while
       rendering leaves it live for the user to end. Replying before the
       setup wait lets RemoveHints through even if setup never finishes. */
    this.render(context).catch(printError);
    return context.id;
  }

  private async render(context: HintContext) {
    /* WHY: the session may end at any await; rendering after that would
       leave hints no session can remove. */
    await this.setupDone.promise;
    if (this.context !== context) return;
    await waitUntil(() => Boolean(document.body));
    if (this.context !== context) return;
    const letters = this.hintLetters;
    if (letters.length === 0)
      throw Error("Ilegal state invocation: hintLetters is empty");
    context.hintLetters = letters;
    /* WHY: letters typed before setup() were kept unchecked. */
    context.inputSequence = context.inputSequence.filter((l) =>
      letters.includes(l),
    );

    const hintTextGenerator = generateHintTexts(letters);
    for await (const elementRects of this.rectAggregator.aggregate(
      context.id,
    )) {
      if (this.context !== context) break;
      if (!this.view.isStarted()) this.view.start();
      if (elementRects.length === 0) continue;
      const hintTexts = take(hintTextGenerator, elementRects.length);
      hintTexts.sort(compareByHintLettersOrder(letters));
      const targets: HintedElement[] = [
        ...map(
          zip(elementRects, hintTexts),
          ([er, hint]): HintedElement => ({ state: "init", hint, ...er }),
        ),
      ];
      context.targets.push(...targets);
      /* WHY: letters typed before these targets existed are only in
         inputSequence; without applying them here the targets stay "init" and
         later letters match against a sequence that no chip reflects. */
      const changes =
        context.inputSequence.length > 0 ? applyInput(context, targets) : [];
      this.view.render(targets);
      /* WHY: HintView.hit hides the active overlay and clears the cycle badge
         unless `changes` contains the hit, so calling it for a batch without
         one would erase the hit shown for an earlier batch. A hit decided by
         the input sequence can only appear in a batch when no earlier batch
         had one. */
      if (changes.some((t) => t.state === "hit"))
        this.showHit(context, changes);
    }
  }

  /**
   * The context of session `id` if it is the live one. Messages of an ended
   * session can arrive after the next one started, so a mismatch is not an
   * error.
   */
  private live(id: SessionId): HintContext | null {
    const context = this.context;
    if (context?.id === id) return context;
    console.debug("Ignore a message of session", id, "live:", context?.id);
    return null;
  }

  hitHint(id: SessionId, inputLetter: SingleLetter) {
    const context = this.live(id);
    if (!context) return;

    /* WHY: until render() fixes the session's hint letters, keep the letter
       for render() to check. */
    if (
      context.hintLetters !== null &&
      !context.hintLetters.includes(inputLetter)
    )
      return;

    delete context.cycle;

    context.inputSequence.push(inputLetter);
    /* WHY: the view has no hints before the first rects arrive, so only
       record the letter; each rendered batch applies inputSequence. */
    if (!this.view.isStarted()) return;
    delete context.hitTarget;
    this.showHit(context, applyInput(context, context.targets));
  }

  private showHit(context: HintContext, changes: HintedElement[]) {
    const hit = context.hitTarget;
    const cycleBadge = hit
      ? cycleBadgeFor(this.view.computeCycleSet(hit), hit)
      : null;
    this.view.hit(changes, hit?.descriptions ?? null, cycleBadge);
  }

  cycleHint(id: SessionId) {
    const context = this.live(id);
    if (!context) return;
    if (!context.hitTarget) return;

    if (!context.cycle) {
      const set = this.view.computeCycleSet(context.hitTarget);
      if (set.length <= 1) return;
      const index = set.indexOf(context.hitTarget);
      if (index < 0) return;
      context.cycle = { set, index };
    }

    const cycle = context.cycle;
    const prevHit = context.hitTarget;
    cycle.index = (cycle.index + 1) % cycle.set.length;
    const newHit = cycle.set[cycle.index];
    if (newHit === prevHit) return;

    prevHit.state = "candidate";
    newHit.state = "hit";
    context.hitTarget = newHit;

    this.view.hit(
      [prevHit, newHit],
      newHit.descriptions,
      cycleBadgeFor(cycle.set, newHit),
    );
  }

  isLiveSession(id: SessionId): boolean {
    return this.live(id) !== null;
  }

  async removeHints(id: SessionId, options: ActionOptions, execute: boolean) {
    const context = this.live(id);
    if (!context) return;
    /* WHY: Clear the context synchronously, before any await. Executing the
     * action round-trips a message (e.g. a target=_blank action opening a new
     * tab); a second AttachHints arriving meanwhile must not see a stale
     * context and throw "already started hinting". */
    this.context = null;
    // WHY: the view starts on the first rects, which may not have arrived yet.
    if (this.view.isStarted()) this.view.remove();
    await this.rectAggregator.action(
      execute ? context.hitTarget?.id : undefined,
      options,
    );
  }
}

export function buildHinterRouter(hinter: HinterContentRoot) {
  return Router.newTabInstance()
    .add("AttachHintsInTab", () => ({ sessionId: hinter.attachHints() }))
    .add("HitHintInTab", ({ sessionId, key }) => hinter.hitHint(sessionId, key))
    .add("CycleHintInTab", ({ sessionId }) => hinter.cycleHint(sessionId))
    .add("IsLiveSessionInTab", ({ sessionId }) =>
      hinter.isLiveSession(sessionId),
    )
    .add("RemoveHintsInTab", ({ sessionId, options, execute }) =>
      hinter.removeHints(sessionId, options, execute),
    );
}

/** Return true if the state is changed. */
function updateTargetState(target: HintedElement, input: string): boolean {
  const oldState = target.state;
  if (target.hint === input) {
    target.state = "hit";
  } else if (target.hint.startsWith(input)) {
    target.state = "candidate";
  } else {
    target.state = "disabled";
  }
  return oldState !== target.state;
}

/** Apply the whole input sequence to targets; return those whose state changed. */
function applyInput(
  context: HintContext,
  targets: HintedElement[],
): HintedElement[] {
  const input = context.inputSequence.join("");
  const changed: HintedElement[] = [];
  for (const t of targets) {
    if (!updateTargetState(t, input)) continue;
    if (t.state === "hit") context.hitTarget = t;
    changed.push(t);
  }
  return changed;
}

function cycleBadgeFor(
  set: HintedElement[],
  hit: HintedElement,
): { count: number; index: number; total: number } | null {
  const count = set.length - 1;
  if (count <= 0) return null;
  const index = set.indexOf(hit) + 1;
  return { count, index, total: set.length };
}

function take<T>(iter: Generator<T>, length: number): T[] {
  const result: T[] = [];
  while (result.length < length) {
    const r = iter.next();
    if (r.done) break;
    result.push(r.value);
  }
  return result;
}

function* generateHintTexts(letters: string): Generator<string> {
  const history: string[] = [];

  for (const t of letters) {
    history.push(t);
    yield t;
  }

  // WHY: Emit repeated 2-same-letter hints first because they're easier to type.
  for (const t of letters) {
    const h = t + t;
    history.push(h);
    yield h;
  }

  let index = 0;
  while (true) {
    const suffix = history[index];
    for (const t of letters) {
      if (suffix === t) continue; // WHY: already emitted as a 2-same-letter hint above
      const h = t + suffix;
      history.push(h);
      yield h;
    }
    index++;
  }
}

function compareByHintLettersOrder(letters: string) {
  return (a: string, b: string) => {
    const m = Math.min(a.length, b.length);
    for (let i = 0; i < m; i++) {
      const aIndex = letters.indexOf(a[i]);
      const bIndex = letters.indexOf(b[i]);
      if (aIndex < bIndex) return -1;
      if (aIndex > bIndex) return 1;
    }
    return a.length - b.length;
  };
}
