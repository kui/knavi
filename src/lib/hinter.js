// @flow

import { EventEmitter } from "./event-emitter";
import RectsDetector from "./rects-detector";
import * as iters from "./iters";
import * as utils from "./utils";
import ActionHandler from "./action-handlers";

import type { Rect } from "./rects-detector";
import type { ActionOptions } from "./action-handlers";

export default class Hinter {
  hintLetters: string;
  context: ?HintContext;
  actionHandler: ActionHandler;

  onHinted: EventEmitter<HintEvent>;
  onHintHit: EventEmitter<HitEvent>;
  onDehinted: EventEmitter<DehintEvent>;

  constructor(hintLetters: string, actionHandler: ActionHandler) {
    this.hintLetters = hintLetters.toLowerCase();
    this.actionHandler = actionHandler;

    this.onHinted = new EventEmitter;
    this.onHintHit = new EventEmitter;
    this.onDehinted = new EventEmitter;
  }

  isHinting() {
    return this.context != null;
  }

  attachHints() {
    if (this.isHinting()) {
      throw Error("Ilegal state invocation: attachHints");
    }
    this.context = initContext(this);
    this.onHinted.emit({ context: this.context });
  }

  hitHint(key: string) {
    const context = this.context;
    if (context == null) {
      throw Error("Ilegal state invocation: hitHint");
    }

    const inputChar = key.toLowerCase();
    if (!this.hintLetters.includes(inputChar)) return;

    const stateChanges = context.update(inputChar);
    const actionDescriptions = context.hitTarget && this.actionHandler.getDescriptions(context.hitTarget);
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
      this.actionHandler.handle(context.hitTarget, options);
    }

    this.onDehinted.emit({ context, options });
  }
}

export type TargetState = "disabled" | "candidate" | "hit" | "init";
export type TargetStateChanges = Map<HintedTarget, { oldState: TargetState, newState: TargetState }>;

class HintContext {
  targets: HintedTarget[];
  hitTarget: ?HintedTarget;
  rectsDetector: RectsDetector;
  inputSequence: string[];

  constructor(targets: HintedTarget[], rectsDetector: RectsDetector) {
    this.targets = targets;
    this.rectsDetector = rectsDetector;
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

declare interface HintEvent {
  context: HintContext;
}

declare interface HitEvent {
  context: HintContext;
  input: string;
  stateChanges: TargetStateChanges;
  actionDescriptions: ?{ short: string, long: string };
}

declare interface DehintEvent {
  context: HintContext;
  options: ActionOptions;
}

function initContext(self: Hinter): HintContext {
  const rectsDetector = new RectsDetector;
  // Benchmark: this operation is most heavy.
  console.time("list all target");
  let targets = listAllTarget(rectsDetector);
  console.timeEnd("list all target");
  targets = distinctSimilarTarget(targets, rectsDetector);
  return new HintContext(hintTargets(targets, self.hintLetters, rectsDetector), rectsDetector);
}

export class HintedTarget {
  state: TargetState;
  hint: string;
  element: HTMLElement;
  rects: Rect[];
  mightBeClickable: boolean;
  filteredOutBy: ?Target;
  _style: ?CSSStyleDeclaration;
  _rectsDetector: RectsDetector;

  constructor(hint: string,
              element: HTMLElement,
              rects: Rect[],
              rectsDetector: RectsDetector,
              opts?: {
                mightBeClickable?: boolean,
                style?: ?CSSStyleDeclaration,
              } = {
                mightBeClickable: false,
              }) {
    this.state = "init";
    this.hint = hint;
    this.element = element;
    this.rects = rects;
    this.mightBeClickable = opts.mightBeClickable || false;
    this._style = opts.style;
    this._rectsDetector = rectsDetector;
  }

  getStyle(): CSSStyleDeclaration {
    if (this._style) return this._style;
    this._style = window.getComputedStyle(this.element);
    return this._style;
  }

  getBoundingClientRect(): Rect {
    return this._rectsDetector.getBoundingClientRect(this.element);
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

declare interface Target {
  element: HTMLElement;
  rects: Rect[];
  mightBeClickable?: boolean;
  filteredOutBy?: ?Target;
  style?: ?CSSStyleDeclaration;
}

const HINTABLE_QUERY = [
  "a[href]",
  "area[href]",
  "details",
  "textarea:not([disabled])",
  "button:not([disabled])",
  "select:not([disabled])",
  "input:not([type=hidden]):not([disabled])",
  "iframe",
  "[tabindex]",
  "[onclick]",
  "[onmousedown]",
  "[onmouseup]",
  "[contenteditable='']",
  "[contenteditable=true]",
  "[role=link]",
  "[role=button]",
  "[data-image-url]",
].map((s) => "body /deep/ " + s).join(",");

function listAllTarget(visibleRects: RectsDetector): Target[] {
  const selecteds = new Set(document.querySelectorAll(HINTABLE_QUERY));
  const targets: Target[] = [];

  if (document.activeElement !== document.body) {
    const rects = Array.from(document.body.getClientRects());
    targets.push({ element: document.body, rects });
  }

  for (const element of document.querySelectorAll("body /deep/ *")) {
    let isClickableElement = false;
    let mightBeClickable = false;
    let style = null;

    if (selecteds.has(element)) {
      isClickableElement = true;
    } else {
      style = window.getComputedStyle(element);
      // might be clickable
      if (["pointer", "zoom-in", "zoom-out"].includes(style.cursor)) {
        mightBeClickable = true;
        isClickableElement = true;
      } else if (utils.isScrollable(element, style)) {
        isClickableElement = true;
      }
    }

    if (!isClickableElement) continue;

    const rects = visibleRects.get(element);
    if (rects.length === 0) continue;

    targets.push({ element, rects, mightBeClickable, style });
  }

  return targets;
}

function distinctSimilarTarget(targets: Target[], visibleRects: RectsDetector): Target[] {
  const targetMap: Map<Element, Target> = new Map((function* () {
    for (const t of targets) yield [t.element, t];
  })());

  function isVisibleNode(node) {
    // filter out blank text nodes
    if (node instanceof Text) return !(/^\s*$/).test(node.textContent);
    // filter out invisible element.
    if (node instanceof HTMLElement) {
      if (visibleRects.get(node).length >= 1) return true;
      return false;
    }
    return true;
  }

  // Filter out if this target is a child of <a> or <button>
  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    if (!target.mightBeClickable) continue;

    const parentTarget = iters.first(iters.flatMap(iters.traverseParent(target.element), (p) => {
      const t = targetMap.get(p);
      if (t == null) return [];
      if (t.filteredOutBy) return [t.filteredOutBy];
      if (["A", "BUTTON"].includes(t.element.tagName)) return [t];
      return [];
    }));
    if (parentTarget) {
      target.filteredOutBy = parentTarget;
      console.debug("filter out: a child of a parent <a>/<button>: target=%o", target.element);
    }
  }

  // Filter out targets that is only one child for a parent target element.
  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    if (!target.mightBeClickable) continue;
    if (target.filteredOutBy) continue;

    const thinAncestors = iters.takeWhile(iters.traverseParent(target.element), (e) => {
      return iters.length(iters.filter(e.childNodes, isVisibleNode)) === 1;
    });
    const parentTarget = iters.first(iters.flatMap(thinAncestors, (p) => {
      const t = targetMap.get(p);
      if (t == null) return [];
      if (t.filteredOutBy) return [t.filteredOutBy];
      return [t];
    }));
    if (parentTarget) {
      target.filteredOutBy = parentTarget;
      console.debug("filter out: a child of a thin parent: target=%o", target.element);
    }
  }

  // Filter out targets that contains only existing targets
  for (let i = targets.length - 1; i >= 0; i--) {
    const target = targets[i];
    if (!target.mightBeClickable) continue;
    if (target.filteredOutBy) continue;

    const childNodes = Array.from(iters.filter(target.element.childNodes, isVisibleNode));
    if (childNodes.every((c) => targetMap.has((c: any)))) {
      const child = childNodes[0];
      target.filteredOutBy = targetMap.get((child: any));
      console.debug("filter out: only targets containing: target=%o", target.element);
    }
  }

  return targets.filter((t) => t.filteredOutBy == null);
}

function hintTargets(targets: Target[], hintLetters: string, rectsDetector: RectsDetector): HintedTarget[] {
  const texts = generateHintTexts(targets.length, hintLetters);
  return targets.map((t, index) => new HintedTarget(
    texts[index],
    t.element,
    t.rects,
    rectsDetector,
    {
      mightBeClickable: t.mightBeClickable,
      style: t.style,
    }
  ));
}

function generateHintTexts(num: number, hintLetters: string): string[] {
  const texts = Array.from(hintLetters);

  if (texts.length > num) return texts;

  // At first, Add repeat 2 same letters text because we input these easily.
  for (const hintLetter of hintLetters) texts.push(hintLetter + hintLetter);

  let i = 0;
  while (texts.length < num) {
    const suffix = texts[i];
    for (const hintLetter of hintLetters) {
      if (suffix !== hintLetter) // Avoid text duplications with above texts
        texts.push(hintLetter + suffix);
    }
    i++;
  }

  return texts.sort();
}
