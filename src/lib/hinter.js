import { send } from "./chrome-messages.js";
import * as rectFetcher from "./rect-fetcher-client.js";

export default class Hinter {
  constructor(hintLetters) {
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
    const context = new HintContext();
    this.context = context;

    send({ type: "StartHinting", context });

    await rectFetcher.fetchAllRects((holders) => {
      if (holders.length === 0) return;

      const hintTexts = [];
      while (hintTexts.length < holders.length) {
        const h = hintTextGenerator.next().value;
        if (h) hintTexts.push(h);
      }
      hintTexts.sort(comparerByProvidedLetters(this.hintLetters));

      console.debug("hintTexts", hintTexts);
      const newTargets = holders.map((holder, index) => {
        const t = hintTexts[index];
        if (!t) throw Error("Illegal state");
        return new Target(t, holder);
      });
      context.targets.splice(-1, 0, ...newTargets);
      send({ type: "NewTargets", context, newTargets });
    });

    send({ type: "EndHinting", context });
  }

  async hitHint(key) {
    const context = this.context;
    if (context == null) {
      throw Error("Ilegal state invocation: hitHint");
    }

    const inputChar = key;
    if (!this.hintLetters.includes(inputChar)) return;

    const stateChanges = context.update(inputChar);

    let actionDescriptions;
    if (context.hitTarget) {
      actionDescriptions = await rectFetcher.getDescriptions(
        context.hitTarget.holder,
      );
    }

    send({
      type: "AfterHitHint",
      context,
      input: inputChar,
      stateChanges,
      actionDescriptions,
    });
  }

  removeHints(options) {
    const context = this.context;
    if (context == null) {
      throw Error("Ilegal state invocation: removeHints");
    }
    this.context = null;

    if (context.hitTarget != null) {
      rectFetcher.action(context.hitTarget.holder, options);
    }

    send({ type: "AfterRemoveHints", context, options });
  }
}

export class Target {
  constructor(hint, holder) {
    this.hint = hint;
    this.holder = holder;
    this.state = "init";
  }

  updateState(inputs) {
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
  constructor() {
    this.targets = [];
    this.inputSequence = [];
  }

  update(inputChar) {
    this.inputSequence.push(inputChar);
    const inputs = this.inputSequence.join("");

    this.hitTarget = null;
    return this.targets.reduce((changes, t) => {
      const oldState = t.state;
      const newState = t.updateState(inputs);
      if (newState === "hit") this.hitTarget = t;
      if (oldState !== newState)
        changes.push({ target: t, oldState, newState });
      return changes;
    }, []);
  }
}

function* generateHintTexts(hintLetters) {
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

function comparerByProvidedLetters(letters) {
  return (a, b) => {
    const length = Math.max(a.length, b.length);
    for (let i = 0; i < length; i++) {
      const aLetter = a[i];
      if (!aLetter) return -1;
      const bLetter = b[i];
      if (!bLetter) return 1;
      const aIndex = letters.indexOf(aLetter);
      const bIndex = letters.indexOf(bLetter);
      if (aIndex > bIndex) return 1;
      if (aIndex < bIndex) return -1;
    }
    return 0;
  };
}
