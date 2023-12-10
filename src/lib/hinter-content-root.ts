import { waitUntil } from "./animations";
import { HintView } from "./hinter-view";
import { map, zip } from "./iters";
import type { RectAggregatorClient } from "./rect-aggregator-client";
import { SingleLetter } from "./strings";

interface HintContext {
  targets: HintedElement[];
  inputSequence: string[];
  hitTarget?: HintedElement | undefined;
}

export class HinterContentRoot {
  private context: HintContext | null = null;
  private hintLetters = "";

  constructor(
    private rectAggregator: RectAggregatorClient,
    private view: HintView,
  ) {}

  setup(hintLetters: string) {
    this.hintLetters = hintLetters;
  }

  async attachHints() {
    if (this.context)
      throw Error("Ilegal state invocation: already started hinting");
    if (this.hintLetters.length === 0)
      throw Error("Ilegal state invocation: hintLetters is empty");

    this.context = {
      inputSequence: [],
      targets: [],
    };

    await waitUntil(() => Boolean(document.body));

    const hintTextGenerator = this.generateHintTexts();
    for await (const elementRects of this.rectAggregator.aggregate()) {
      if (!this.view.isStarted()) this.view.start();
      if (elementRects.length === 0) continue;
      const hintTexts = take(hintTextGenerator, elementRects.length);
      const targets: HintedElement[] = [
        ...map(
          zip(elementRects, hintTexts),
          ([er, hint]) => ({ state: "init", hint, ...er }) as HintedElement,
        ),
      ];
      this.context.targets.push(...targets);
      this.view.render(targets);
    }
  }

  // TODO We can meke this function better for keyboard typing.
  *generateHintTexts(): Generator<string> {
    const history: string[] = [];

    for (const t of this.hintLetters) {
      history.push(t);
      yield t;
    }

    // At first, Add repeat 2 same letters text because we input these easily.
    for (const t of this.hintLetters) {
      const h = t + t;
      history.push(h);
      yield h;
    }

    let index = 0;
    while (true) {
      const suffix = history[index];
      for (const t of this.hintLetters) {
        if (suffix === t) continue; // Avoid above 2-same-letters-text
        const h = t + suffix;
        history.push(h);
        yield h;
      }
      index++;
    }
  }

  hitHint(inputLetter: SingleLetter) {
    const context = this.context;
    if (!context) throw Error("Ilegal state invocation: hinting not started");

    if (!this.hintLetters.includes(inputLetter)) return;

    const changes = [...updateContext(context, inputLetter)];

    const actionDescriptions = context.hitTarget
      ? context.hitTarget.descriptions
      : null;
    this.view.hit(changes, actionDescriptions);
  }

  async removeHints(options: ActionOptions) {
    const context = this.context;
    if (!context) {
      throw Error("Ilegal state invocation: hinting not started");
    }
    this.view.remove();
    await this.rectAggregator.action(context.hitTarget?.id, options);
    this.context = null;
  }
}

// Return true if the state is changed.
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

// Return targets whose state is changed.
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

function take<T>(iter: Generator<T>, length: number): T[] {
  const result: T[] = [];
  while (result.length < length) {
    const r = iter.next();
    if (r.done) break;
    result.push(r.value);
  }
  return result;
}
