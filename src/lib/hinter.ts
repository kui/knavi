import type { RectFetcherClient } from "./rect-fetcher-client";
import { Router, sendToRuntime } from "./chrome-messages";
import { head } from "./iters";
import { SingleLetter } from "./strings";

export class Hinter {
  private context: HintContext | null = null;
  private hintLetters = "";

  constructor(private rectFetcher: RectFetcherClient) {}

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
      hitTarget: null,
    };
    const holders = await this.rectFetcher.fetch();
    const hintTexts = [...head(this.generateHintTexts(), holders.length)];
    hintTexts.sort(this.comparerByProvidedLetters);
    console.debug("hintTexts", hintTexts);

    const targets: HintTarget[] = holders.map((holder, index) => {
      const t = hintTexts[index];
      return {
        hint: t,
        holder,
        state: "init",
      };
    });

    this.context.targets = targets;
    await sendToRuntime("RenderTargets", { targets });
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

  private comparerByProvidedLetters = (a: string, b: string) => {
    const length = Math.max(a.length, b.length);
    for (let i = 0; i < length; i++) {
      const aLetter = a[i];
      if (!aLetter) return -1;
      const bLetter = b[i];
      if (!bLetter) return 1;
      const aIndex = this.hintLetters.indexOf(aLetter);
      const bIndex = this.hintLetters.indexOf(bLetter);
      if (aIndex > bIndex) return 1;
      if (aIndex < bIndex) return -1;
    }
    return 0;
  };

  async hitHint(inputLetter: SingleLetter) {
    const context = this.context;
    if (!context) throw Error("Ilegal state invocation: hinting not started");

    if (!this.hintLetters.includes(inputLetter)) return;

    const changes = [...updateContext(context, inputLetter)];

    let actionDescriptions = null;
    if (context.hitTarget) {
      actionDescriptions = await this.rectFetcher.getDescriptions(
        context.hitTarget.holder,
      );
    }

    await sendToRuntime("AfterHitHint", {
      input: inputLetter,
      changes,
      actionDescriptions,
    });
  }

  async removeHints(options: ActionOptions) {
    const context = this.context;
    if (!context) {
      throw Error("Ilegal state invocation: hinting not started");
    }
    if (context.hitTarget) {
      await this.rectFetcher.action(context.hitTarget.holder, options);
    }

    await sendToRuntime("AfterRemoveHints");
  }

  router() {
    return Router.newInstance()
      .add("AttachHints", () => this.attachHints())
      .add("HitHint", ({ key }) => this.hitHint(key))
      .add("RemoveHints", ({ options }) => this.removeHints(options));
  }
}

// Return true if the state is changed.
function updateTargetState(target: HintTarget, input: string): boolean {
  const oldState = target.state;
  if (target.hint === input) {
    target.state = "hit";
  } else if (target.hint.startsWith(input)) {
    target.state = "candidate";
  } else {
    target.state = "disabled";
  }
  return oldState === target.state;
}

// Return targets whose state is changed.
function* updateContext(
  context: HintContext,
  inputLetter: SingleLetter,
): Generator<HintTarget> {
  context.inputSequence.push(inputLetter);
  const input = context.inputSequence.join("");
  for (const t of context.targets) {
    const change = updateTargetState(t, input);
    if (change) {
      yield t;
      if (t.state === "hit") context.hitTarget = t;
    }
  }
}
