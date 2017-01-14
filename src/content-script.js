// @flow

import EventMatcher from "key-input-elements/lib/event-matcher";
import { EventEmitter } from "./lib/event-emitter";
import { config } from "./lib/config";
import * as iters from "./lib/iters";
import VisibleRects from "./lib/visible-rects";

import type { Rect } from "./lib/visible-rects";

const DEFAULT_MAGIC_KEY = "Space";
const DEFAULT_HINTS = "ASDFGHJKL";
const DEFAULT_STYLE = `
#jp-k-ui-knavi-overlay {
  background-color: black;
  border: 1px solid white;
  opacity: 0.2;
  transition-property: left, top, width, height;
  transition-duration: 0.4s;
  /* transition-timing-function: ease-in; */
}
#jp-k-ui-knavi-active-overlay {
  background-color: red;
  border: 1px solid white;
  opacity: 0.1;
  transition-property: left, top, width, height;
  transition-duration: 0.2s;
}
#jp-k-ui-knavi-wrapper > div {
  margin: 0px;
  padding: 3px;
  background-color: black;
  color: white;
  border: white solid 1px;
  line-height: 1em;
  font-size: 16px;
  font-family: monospace;
}
#jp-k-ui-knavi-wrapper > div.jp-k-ui-knavi-disabled {
  opacity: 0.6;
}
#jp-k-ui-knavi-wrapper > div.jp-k-ui-knavi-candidate {
  background-color: yellow;
  color: black;
  border: black solid 1px;
}
#jp-k-ui-knavi-wrapper > div.jp-k-ui-knavi-hit {
  background-color: #c00;
  color: white;
  border: black solid 1px;
  font-weight: bold;
}`.replace(/(^|\n)\t+/g, "$1");

const OVERLAY_PADDING = 8;
const CONTAINER_ID = "jp-k-ui-knavi";
const OVERLAY_ID = "jp-k-ui-knavi-overlay";
const ACTIVE_OVERLAY_ID = "jp-k-ui-knavi-active-overlay";
const WRAPPER_ID = "jp-k-ui-knavi-wrapper";
const Z_INDEX_OFFSET = 2147483640;
const CANDIDATE_HINT_Z_INDEX = Z_INDEX_OFFSET + 1;
const HIT_HINT_Z_INDEX = Z_INDEX_OFFSET + 2;

let hitEventMatcher: EventMatcher;
let blurEventMatcher: EventMatcher;
let hinter: Hinter;
let css: string;

const visibleRects = new VisibleRects;

async function main(window: any) {
  const configValues = await config.get();
  console.debug("config: ", configValues);

  hitEventMatcher = new EventMatcher(configValues["magic-key"] || DEFAULT_MAGIC_KEY);
  blurEventMatcher = new EventMatcher(configValues["blur-key"] || "");
  hinter = new Hinter(document, configValues["hints"] || DEFAULT_HINTS);
  css = configValues["css"] || DEFAULT_STYLE;

  setupEvents(window);
}

function setupEvents(window: any) {
  function hookKeydown(event: KeyboardEvent) {
    if (hinter.status === HinterStatus.NO_HINT) {
      if (!isEditable(event.target) && hitEventMatcher.test(event)) {
        event.preventDefault();
        event.stopPropagation();
        hinter.attachHints();
        return;
      }
      if (blurEventMatcher.test(event) && isBlurable()) {
        event.preventDefault();
        event.stopPropagation();
        console.debug("blur", document.activeElement);
        document.activeElement.blur();
        return;
      }
      return;
    }
    if (hinter.status === HinterStatus.HINTING) {
      if (hinter.hitHint(event.key)) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }
  }
  function hookKeyup(event: KeyboardEvent) {
    if (hinter.status === HinterStatus.HINTING &&
        hitEventMatcher.testModInsensitive(event)) {
      event.preventDefault();
      event.stopPropagation();
      hinter.removeHints(event);
    }
  }
  function hookKeypress(event: KeyboardEvent) {
    if (hinter.status === HinterStatus.HINTING) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  window.addEventListener("keydown", hookKeydown, true);
  window.addEventListener("keyup", hookKeyup, true);
  window.addEventListener("keypress", hookKeypress, true);

  new HintsView(hinter);
}

function isEditable(elem: EventTarget) {
  if (!(elem instanceof HTMLElement)) return false;
  return elem.selectionStart != null || elem.contentEditable === "true";
}

function isBlurable() {
  return document.activeElement !== document.body;
}

//

type HinterStatusType = NO_HINT_TYPE | HINTING_TYPE;
type NO_HINT_TYPE = 0;
type HINTING_TYPE = 1;

const HinterStatus: { [k: string]: HinterStatusType } = {
  NO_HINT: 0,
  HINTING: 1,
};

declare interface DehintOptions {
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

class Hinter {
  doc: Document;
  hints: string;
  inputs: string[];
  status: HinterStatusType;

  onHinted: EventEmitter<null>;
  onHintHit: EventEmitter<string[]>;
  onDehinted: EventEmitter<DehintOptions>;

  constructor(doc: Document, hintChars: string) {
    this.doc = doc;
    this.hints = hintChars.toLowerCase();
    this.inputs = [];
    this.status = HinterStatus.NO_HINT;

    this.onHinted = new EventEmitter();
    this.onHintHit = new EventEmitter();
    this.onDehinted = new EventEmitter();
  }

  attachHints() {
    if (this.status === HinterStatus.HINTING) {
      throw Error("Ilegal state invokation: attachHints");
    }
    this.status = HinterStatus.HINTING;
    this.onHinted.emit(null);
  }

  hitHint(key: string): boolean {
    if (this.status !== HinterStatus.HINTING) {
      throw Error("Ilegal state invokation: hitHint");
    }

    const inputChar = key.toLowerCase();
    if (!isHintChar(this, inputChar)) return false;

    this.inputs.push(inputChar);
    this.onHintHit.emit(this.inputs);
    return true;
  }

  removeHints(opts: DehintOptions) {
    if (this.status !== HinterStatus.HINTING) {
      throw Error("Ilegal state invokation: removeHints");
    }

    this.inputs = [];
    this.status = HinterStatus.NO_HINT;
    this.onDehinted.emit(opts);
  }
}

function isHintChar(self: Hinter, inputChar: string) {
  return self.hints.indexOf(inputChar) >= 0;
}

//

declare class Object {
  static assign: Object$Assign;
}

class Hint {
  state: "disable" | "candidate" | "hit" | null;
  text: string;
  elements: HTMLDivElement[];
  target: Target;

  constructor(text: string, elements: HTMLDivElement[], target: Target) {
    this.state = null;
    this.text = text;
    this.elements = elements;
    this.target = target;
  }

  isDisabled() { return this.state === "disable"; }
  setDisabled() {
    if (this.isDisabled()) return;
    this.state = "disable";
    for (const e of this.elements) {
      e.classList.add("jp-k-ui-knavi-disabled");
      e.classList.remove("jp-k-ui-knavi-hit");
      e.classList.remove("jp-k-ui-knavi-candidate");
      e.style.zIndex = Z_INDEX_OFFSET.toString();
    }
  }

  isCandidate() { return this.state === "candidate"; }
  setCandidate() {
    if (this.isCandidate()) return;
    if (this.isDisabled()) throw Error("Illegal state");
    if (this.isHit()) throw Error("Illegal state");
    this.state = "candidate";
    for (const e of this.elements) {
      e.classList.add("jp-k-ui-knavi-candidate");
      e.style.zIndex = CANDIDATE_HINT_Z_INDEX.toString();
    }
  }

  isHit() { return this.state === "hit"; }
  setHit() {
    if (this.isHit()) return;
    if (this.isDisabled()) throw Error("Illegal state");
    this.state = "hit";
    for (const e of this.elements) {
      e.classList.add("jp-k-ui-knavi-hit");
      e.classList.remove("jp-k-ui-knavi-candidate");
      e.style.zIndex = HIT_HINT_Z_INDEX.toString();
    }
  }

  match(inputs: string) {
    if (this.isDisabled()) return;
    if (this.text === inputs) {
      this.setHit();
      return;
    }
    if (this.text.startsWith(inputs)) {
      this.setCandidate();
      return;
    }
    this.setDisabled();
  }
}

class HintsView {
  constructor(hinter: Hinter) {
    const container = document.createElement("div");
    container.id = CONTAINER_ID;
    Object.assign(container.style, {
      position: "static",
      padding: "0px", margin: "0px",
      width:  "0px", height: "0px",
      background: "none"
    });

    const overlay = container.appendChild(document.createElement("div"));
    overlay.id = OVERLAY_ID;
    Object.assign(overlay.style, {
      padding: "0px", margin: "0px",
      display: "block",
      position: "absolute",
      zIndex: Z_INDEX_OFFSET.toString(),
    });

    const activeOverlay = container.appendChild(document.createElement("div"));
    activeOverlay.id = ACTIVE_OVERLAY_ID;
    Object.assign(activeOverlay.style, {
      padding: "0px", margin: "0px",
      display: "none",
      position: "absolute",
      zIndex: Z_INDEX_OFFSET.toString(),
    });

    let wrapper: ?HTMLDivElement;
    let hints: ?Hint[];
    let style: ?HTMLElement;

    hinter.onHinted.listen(() => {
      fitOverlay(overlay);
      activeOverlay.style.display = "none";

      const o = generateHints(hinter.hints);
      wrapper = o.wrapper;
      hints = o.hints;
      style = generateStyle();
      container.appendChild(wrapper);
      container.appendChild(style);
      document.body.insertBefore(container, document.body.firstChild);
    });
    hinter.onHintHit.listen((inputs) => {
      if (hints == null) throw Error("Illegal state");
      highligtHints(hints, inputs.join(""));
      moveOverlay(overlay, hints);
      moveActiveOverlay(activeOverlay, hints);
    });
    hinter.onDehinted.listen((opts) => {
      if (wrapper == null || style == null || hints == null) throw Error("Illegal state");
      const hitHint = hints.find((h) => h.state === "hit");
      handleHitTarget(hitHint, opts);
      document.body.removeChild(container);
      container.removeChild(wrapper);
      container.removeChild(style);
      wrapper = null;
      hints = null;
      style = null;
    });
  }
}

function handleHitTarget(hitHint: ?Hint, options: DehintOptions) {
  if (!hitHint) return;

  console.log("hit", hitHint);

  const element = hitHint.target.element;
  const style = window.getComputedStyle(element);
  if (isScrollable(element, style)) {
    // Make scrollable from your keyboard
    if (!element.hasAttribute("tabindex")) {
      element.setAttribute("tabindex", "-1");
      element.addEventListener("blur", function removeTabIndex() {
        element.removeAttribute("tabindex");
        element.removeEventListener("blur", removeTabIndex);
      });
    }
    element.focus();
    console.log("focus as an scrollable element");
    return;
  }
  if (isEditable(element)) {
    element.focus();
    console.log("focus as an editable element");
    return;
  }
  if (element.tagName === "BODY") {
    const activeElement = document.activeElement;
    activeElement.blur();
    console.log("blue an active element: ", activeElement);
    return;
  }
  if (element.tagName === "IFRAME") {
    element.focus();
    console.log("focus as an iframe");
    return;
  }

  simulateClick(element, options);
  console.log("click");
}

function simulateClick(element: HTMLElement, options: DehintOptions) {
  dispatchMouseEvent("mouseover", element, options);

  for (const type of ["mousedown", "mouseup", "click"]) {
    if (!dispatchMouseEvent(type, element, options)) {
      console.debug("Canceled: ", type);
      return false;
    }
  }
  return true;
}

declare class MouseEvent extends UIEvent {
  constructor(type: MouseEventTypes, mouseEventInit?: MouseEventInit): void;
}

declare interface MouseEventInit {
  screenX?: number;
  screenY?: number;
  clientX?: number;
  clientY?: number;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  button?: number;
  buttons?: number;
  relatedTarget?: EventTarget;
  regison?: string;
  bubbles?: boolean;
  cancelable?: boolean;
}

/// Return false if canceled
function dispatchMouseEvent(type: MouseEventTypes, element: HTMLElement, options: DehintOptions): boolean {
  const event = new MouseEvent(type, {
    button: 0,
    bubbles: true,
    cancelable: true,
    ctrlKey: options.ctrlKey,
    shiftKey: options.shiftKey,
    altKey: options.altKey,
    metaKey: options.metaKey || options.ctrlKey,
  });
  return element.dispatchEvent(event);
}

function isScrollable(element: HTMLElement, style: any): boolean {
  if (element.scrollHeight - element.clientHeight > 10
      && ["auto", "scroll"].includes(style.overflowY)) return true;
  if (element.scrollWidth - element.clientWidth > 10
      && ["auto", "scroll"].includes(style.overflowX)) return true;
  return false;
}

function moveActiveOverlay(activeOverlay: HTMLDivElement, hints: Hint[]) {
  const hit = hints.find((h) => h.isHit());
  if (!hit) {
    activeOverlay.style.display = "none";
    return;
  }

  const rect = hit.target.element.getBoundingClientRect();
  const offsetY = window.scrollY;
  const offsetX = window.scrollX;

  Object.assign(activeOverlay.style, {
    top: `${rect.top + offsetY}px`,
    left: `${rect.left + offsetX}px`,
    height: `${Math.round(rect.height)}px`,
    width: `${Math.round(rect.width)}px`,
    display: "block",
  });
}

function moveOverlay(overlay: HTMLDivElement, hints: Hint[]) {
  const scrollHeight = document.body.scrollHeight;
  const scrollWidth = document.body.scrollWidth;
  const offsetY = window.scrollY;
  const offsetX = window.scrollX;
  let hasHitOrCand = false;
  const rr = { top: scrollHeight, left: scrollWidth, bottom: 0, right: 0 };
  for (const hint of hints) {
    if (hint.isDisabled()) continue;
    hasHitOrCand = true;

    const rect = hint.target.element.getBoundingClientRect();

    rr.top = Math.min(rr.top, rect.top + offsetY);
    rr.left = Math.min(rr.left, rect.left + offsetX);
    rr.bottom = Math.max(rr.bottom, rect.bottom + offsetY);
    rr.right = Math.max(rr.right, rect.right + offsetX);
  }

  if (!hasHitOrCand) {
    overlay.style.display = "none";
    return;
  }

  // padding
  rr.top = rr.top - OVERLAY_PADDING > 0 ? rr.top - OVERLAY_PADDING : 0;
  rr.left = rr.left - OVERLAY_PADDING > 0 ? rr.left - OVERLAY_PADDING : 0;
  rr.bottom = rr.bottom + OVERLAY_PADDING < scrollHeight ? rr.bottom + OVERLAY_PADDING : scrollHeight;
  rr.right = rr.right + OVERLAY_PADDING < scrollWidth ? rr.right + OVERLAY_PADDING : scrollWidth;

  Object.assign(overlay.style, {
    top: `${rr.top}px`,
    left: `${rr.left}px`,
    height: `${rr.bottom - rr.top}px`,
    width: `${rr.right - rr.left}px`,
    display: "block",
  });
}

function generateStyle(): HTMLElement {
  const s = document.createElement("style");
  (s: any).scoped = true;
  s.textContent = css;
  return s;
}

function highligtHints(hints: Hint[], inputs: string) {
  for (const hint of hints) {
    hint.match(inputs);
  }
}

function fitOverlay(overlay: HTMLDivElement) {
  Object.assign(overlay.style, {
    top: `${window.scrollY}px`,
    left: `${window.scrollX}px`,
    width:  "100%",
    height: "100%",
    display: "block",
  });
}

function generateHints(hintLetters: string): { wrapper: HTMLDivElement, hints: Hint[] } {
  const targets = listAllTarget();
  const hintTexts = generateHintTexts(targets.length, hintLetters);
  const wrapper = document.createElement("div");
  wrapper.id = WRAPPER_ID;
  Object.assign(wrapper.style, {
    position: "static",
  });
  const hints = targets.map((target: Target, index: number) => {
    const text = hintTexts[index];
    const elements = buildHintElements(target, text);
    elements.forEach((e) => wrapper.appendChild(e));
    return new Hint(text, elements, target);
  });
  console.debug("hints[%d]: %o", hints.length, hints);
  return { wrapper, hints };
}

function buildHintElements(target: Target, hintTexts: string): HTMLDivElement[] {
  const xOffset = window.scrollX;
  const yOffset = window.scrollY;

  return target.rects.map((rect) => {
    const h = document.createElement("div");
    h.textContent = hintTexts.toUpperCase();
    h.dataset["hint"] = hintTexts;
    const top = Math.max(rect.top, 0);
    const left = Math.max(rect.left, 0);
    Object.assign(h.style, {
      position: "absolute",
      top: Math.round(yOffset + top) + "px",
      left: Math.round(xOffset + left) + "px",
      zIndex: CANDIDATE_HINT_Z_INDEX.toString(),
    });
    return h;
  });
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

declare type Target = {
  element: HTMLElement;
  rects: Rect[];
  mightBeClickable: boolean;
  filteredOutBy?: Target;
};

function listAllTarget(): Target[] {
  const selecteds = new Set(document.querySelectorAll(HINTABLE_QUERY));
  const targets = [];
  if (document.activeElement !== document.body) {
    const rects = Array.from(document.body.getClientRects());
    const r = rects[0];
    if (r.height > window.innerHeight || r.width > window.innerWidth) {
      targets.push({
        element: document.body,
        rects,
        mightBeClickable: false
      });
    }
  }
  for (const element of document.querySelectorAll("body /deep/ *")) {
    let isClickableElement = false;
    let mightBeClickable = false;

    if (selecteds.has(element)) {
      isClickableElement = true;
    } else {
      const style = window.getComputedStyle(element);
      // might be clickable
      if (["pointer", "zoom-in", "zoom-out"].includes(style.cursor)) {
        mightBeClickable = true;
        isClickableElement = true;
      } else if (isScrollable(element, style)) {
        isClickableElement = true;
      }
    }

    if (!isClickableElement) continue;

    const rects = visibleRects.get(element);
    if (rects.length === 0) continue;
    targets.push({ element, rects, mightBeClickable });
  }

  return distinctSimilarTarget(targets);
}

function distinctSimilarTarget(targets: Target[]): Target[] {
  const targetMap: Map<Element, Target> = new Map((function* () {
    for (const t of targets) yield [t.element, t];
  })());

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

  function isVisibleNode(n) {
    // filter out blank text nodes
    if (n instanceof Text) return !(/^\s*$/).test(n.textContent);
    // filter out invisible element.
    if (n instanceof HTMLElement) {
      if (visibleRects.get(n).length >= 1) return true;
      return false;
    }
    return true;
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

main(window);
