// @flow

import { send } from "./chrome-messages";
import * as rectFetcher from "./rect-fetcher-client";

import type { ActionOptions } from "./action-handlers";
import type { RectHolder, Descriptions } from "./rect-fetcher-client";

export type StartHinting = {
  type: "StartHinting";
  context: HintContext;
};
export type NewTargets = {
  type: "NewTargets";
  context: HintContext;
  newTargets: Target[];
};
export type EndHinting = {
  type: "EndHinting";
  context: HintContext;
};
export type AfterHitHint = {
  type: "AfterHitHint";
  context: HintContext;
  input: string;
  stateChanges: TargetStateChange[];
  actionDescriptions: ?Descriptions;
};
export type AfterRemoveHints = {
  type: "AfterRemoveHints";
  context: HintContext;
  options: ActionOptions;
};

export default class Hinter {
  hintLetters: string;
  context: ?HintContext;
  hintTextGenerator: Iterator<string>

  constructor(hintLetters: string) {
    this.hintLetters = hintLetters;
  }

  isHinting() {
    return this.context != null;
  }

  async attachHints() {
    if (this.isHinting()) {
      throw Error("Ilegal state invocation: attachHints");
    }

    const hintTextGenerator = generateHintTexts(this.hintLetters);
    const context = new HintContext;
    this.context = context;

    send(({ type: "StartHinting", context }: StartHinting));

    await rectFetcher.fetchAllRects((holders) => {
      if (holders.length === 0) return;

      const hintTexts = [];
      for (let i = 0; i < holders.length; i++) {
        hintTexts.push(hintTextGenerator.next().value);
      }
      hintTexts.sort();

      console.debug("hintTexts", hintTexts);
      const newTargets = holders.map((holder, index) => {
        const t = hintTexts[index];
        if (!t) throw Error("Illegal state");
        return new Target(t, holder);
      });
      context.targets.splice(-1, 0, ...newTargets);
      send(({ type: "NewTargets", context, newTargets }: NewTargets));
    });

    send(({ type: "EndHinting", context }: EndHinting));
  }

  async hitHint(key: string) {
    const context = this.context;
    if (context == null) {
      throw Error("Ilegal state invocation: hitHint");
    }

    const inputChar = key;
    if (!this.hintLetters.includes(inputChar)) return;

    const stateChanges = context.update(inputChar);

    let actionDescriptions;
    if (context.hitTarget) {
      actionDescriptions = await rectFetcher.getDescriptions(context.hitTarget.holder);
    }

    send(({
      type: "AfterHitHint",
      context,
      input: inputChar,
      stateChanges,
      actionDescriptions
    }: AfterHitHint));
  }

  removeHints(options: ActionOptions) {
    const context = this.context;
    if (context == null) {
      throw Error("Ilegal state invocation: removeHints");
    }
    this.context = null;

    if (context.hitTarget != null) {
      rectFetcher.action(context.hitTarget.holder, options);
    }

    send(({ type: "AfterRemoveHints", context, options }: AfterRemoveHints));
  }
}

export type TargetState = "disabled" | "candidate" | "hit" | "init";
export type TargetStateChange = { target: Target, oldState: TargetState, newState: TargetState };
export class Target {
  state: TargetState;
  hint: string;
  holder: RectHolder;

  constructor(hint: string, holder: RectHolder) {
    this.hint = hint;
    this.holder = holder;
    this.state = "init";
  }

  updateState(inputs: string): TargetState {
    if (this.hint === inputs) {
      this.state = "hit";
    } else if (this.hint.startsWith(inputs)) {
      this.state = "candidate";
    } else {
      this.state = "disabled";
    }
    return this.state;
  }
}

class HintContext {
  targets: Target[];
  hitTarget: ?Target;
  inputSequence: string[];

  constructor() {
    this.targets = [];
    this.inputSequence = [];
  }

  update(inputChar: string): TargetStateChange[] {
    this.inputSequence.push(inputChar);
    const inputs = this.inputSequence.join("");

    this.hitTarget = null;
    return this.targets.reduce((changes, t) => {
      const oldState = t.state;
      const newState = t.updateState(inputs);
      if (newState === "hit") this.hitTarget = t;
      if (oldState !== newState) changes.push({ target: t, oldState, newState });
      return changes;
    }, []);
  }
}

function* generateHintTexts(hintLetters: string): Iterator<string> {
  const letters = Array.from(hintLetters);
  const history = [];

  for (const t of letters) {
    history.push(t);
    yield t;
  }

  // At first, Add repeat 2 same letters text because we input these easily.
  for (const t of letters) {
    const h = t + t;
    history.push(h);
    yield h;
  }

  let index = 0;
  while (true) {
    const suffix = history[index];
    for (const t of letters) {
      if (suffix === t) continue; // Avoid above 2-same-letters-text
      const h = t + suffix;
      history.push(h);
      yield h;
    }
    index++;
  }
}
