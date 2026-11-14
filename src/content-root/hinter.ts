import { waitUntil } from "../dom/animations";
import { HintView } from "./hinter-view";
import { map, zip } from "../lib/iters";
import type { RectAggregatorClient } from "./rect-aggregator-client";
import type { SingleLetter } from "../lib/strings";

interface HintContext {
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
    this.setupDone.resolve();
  }

  async attachHints() {
    if (this.context)
      throw Error("Ilegal state invocation: already started hinting");

    const context: HintContext = {
      inputSequence: [],
      targets: [],
    };
    this.context = context;

    await this.setupDone.promise;
    await waitUntil(() => Boolean(document.body));
    /* WHY: the magic key may be released at any await below; rendering after
       that would leave hints no session can remove. */
    if (this.context !== context) return;
    if (this.hintLetters.length === 0) {
      this.context = null;
      throw Error("Ilegal state invocation: hintLetters is empty");
    }

    const hintTextGenerator = this.generateHintTexts();
    for await (const elementRects of this.rectAggregator.aggregate()) {
      if (this.context !== context) break;
      if (!this.view.isStarted()) this.view.start();
      if (elementRects.length === 0) continue;
      const hintTexts = take(hintTextGenerator, elementRects.length);
      hintTexts.sort(this.compareByHintLettersOrder());
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
      const input = context.inputSequence.join("");
      if (input) {
        for (const t of targets) {
          updateTargetState(t, input);
          if (t.state === "hit") context.hitTarget = t;
        }
      }
      this.view.render(targets);
      if (input) this.showHit(context, targets);
    }
  }

  *generateHintTexts(): Generator<string> {
    const history: string[] = [];

    for (const t of this.hintLetters) {
      history.push(t);
      yield t;
    }

    // WHY: Emit repeated 2-same-letter hints first because they're easier to type.
    for (const t of this.hintLetters) {
      const h = t + t;
      history.push(h);
      yield h;
    }

    let index = 0;
    while (true) {
      const suffix = history[index];
      for (const t of this.hintLetters) {
        if (suffix === t) continue; // WHY: already emitted as a 2-same-letter hint above
        const h = t + suffix;
        history.push(h);
        yield h;
      }
      index++;
    }
  }

  compareByHintLettersOrder() {
    const letters = this.hintLetters;
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

  hitHint(inputLetter: SingleLetter) {
    const context = this.context;
    if (!context) throw Error("Ilegal state invocation: hinting not started");

    if (!this.hintLetters.includes(inputLetter)) return;

    delete context.cycle;

    const changes = [...updateContext(context, inputLetter)];
    /* WHY: the view has no hints before the first rects arrive, so only
       record the letter; the first render applies inputSequence. */
    if (!this.view.isStarted()) return;
    this.showHit(context, changes);
  }

  private showHit(context: HintContext, changes: HintedElement[]) {
    const actionDescriptions = context.hitTarget?.descriptions ?? null;
    const cycleBadge = context.hitTarget
      ? cycleBadgeFor(
          this.view.computeCycleSet(context.hitTarget),
          context.hitTarget,
        )
      : null;
    this.view.hit(changes, actionDescriptions, cycleBadge);
  }

  cycleHint() {
    const context = this.context;
    if (!context) throw Error("Ilegal state invocation: hinting not started");
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

    this.view.hit([prevHit, newHit], newHit.descriptions, {
      count: cycle.set.length - 1,
      index: cycle.index + 1,
      total: cycle.set.length,
    });
  }

  async removeHints(options: ActionOptions, execute: boolean) {
    const context = this.context;
    if (!context) {
      throw Error("Ilegal state invocation: hinting not started");
    }
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

/** Return targets whose state is changed. */
function* updateContext(
  context: HintContext,
  inputLetter: SingleLetter,
): Generator<HintedElement> {
  context.inputSequence.push(inputLetter);
  const input = context.inputSequence.join("");
  delete context.hitTarget;
  for (const t of context.targets) {
    const change = updateTargetState(t, input);
    if (change) {
      if (t.state === "hit") context.hitTarget = t;
      yield t;
    }
  }
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
