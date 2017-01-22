// @flow

import { EventEmitter } from "./event-emitter";
import * as rectFetcher from "./rect-fetcher-client";

import type { ActionOptions } from "./action-handlers";
import type { RectHolder, Descriptions } from "./rect-fetcher-client";

declare interface StartHintingEvent {
  context: HintContext;
}

declare interface NewTargetsEvent {
  context: HintContext;
  newTargets: Target[];
}

declare interface EndHintingEvent {
  context: HintContext;
}

declare interface HitEvent {
  context: HintContext;
  input: string;
  stateChanges: TargetStateChanges;
  actionDescriptions: ?Descriptions;
}

declare interface DehintEvent {
  context: HintContext;
  options: ActionOptions;
}

export default class Hinter {
  hintLetters: string;
  context: ?HintContext;
  hintTextGenerator: Iterator<string>

  onStartHinting: EventEmitter<StartHintingEvent>;
  onNewTargets: EventEmitter<NewTargetsEvent>;
  onEndHinting: EventEmitter<EndHintingEvent>;
  onHintHit: EventEmitter<HitEvent>;
  onDehinted: EventEmitter<DehintEvent>;

  constructor(hintLetters: string) {
    this.hintLetters = hintLetters.toLowerCase();

    this.onStartHinting = new EventEmitter;
    this.onNewTargets = new EventEmitter;
    this.onEndHinting = new EventEmitter;
    this.onHintHit = new EventEmitter;
    this.onDehinted = new EventEmitter;
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

    this.onStartHinting.emit({ context });

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
      this.onNewTargets.emit({ context, newTargets });
    });
    this.onEndHinting.emit({ context });
  }

  async hitHint(key: string) {
    const context = this.context;
    if (context == null) {
      throw Error("Ilegal state invocation: hitHint");
    }

    const inputChar = key.toLowerCase();
    if (!this.hintLetters.includes(inputChar)) return;

    const stateChanges = context.update(inputChar);

    let actionDescriptions;
    if (context.hitTarget) {
      actionDescriptions = await rectFetcher.getDescriptions(context.hitTarget.holder);
    }

    this.onHintHit.emit({ context, input: inputChar, stateChanges, actionDescriptions });
    return;
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
    this.onDehinted.emit({ context, options });
  }
}

export type TargetState = "disabled" | "candidate" | "hit" | "init";
export type TargetStateChanges = Map<Target, { oldState: TargetState, newState: TargetState }>;
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

  update(inputChar: string): TargetStateChanges {
    this.inputSequence.push(inputChar);
    const inputs = this.inputSequence.join("");

    this.hitTarget = null;
    return this.targets.reduce((m, t) => {
      const oldState = t.state;
      const newState = t.updateState(inputs);
      if (newState === "hit") this.hitTarget = t;
      if (oldState !== newState) m.set(t, { oldState, newState });
      return m;
    }, new Map);
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
