// @flow

import EventMatcher from "key-input-elements/lib/event-matcher";
import { EventEmitter } from "./lib/event-emitter";
import { config } from "./lib/config";

const DEFAULT_MAGIC_KEY = "Space";
const DEFAULT_HINTS = "ASDFGHJKL";

const OVERLAY_PADDING = 8;
const CONTAINER_ID = "jp-k-ui-knavi";
const OVERLAY_ID = "jp-k-ui-knavi-overlay";
const ACTIVE_OVERLAY_ID = "jp-k-ui-knavi-active-overlay";
const WRAPPER_ID = "jp-k-ui-knavi-wrapper";
const Z_INDEX_OFFSET = 2147483640;
const CANDIDATE_HINT_Z_INDEX = Z_INDEX_OFFSET + 1;
const HIT_HINT_Z_INDEX = Z_INDEX_OFFSET + 2;

let css = `
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
}
`;

let eventMatcher: EventMatcher;
let hinter: Hinter;

async function main(window: any) {
  const configValues = await config.get();
  console.debug("config: ", configValues);

  eventMatcher = new EventMatcher(configValues["magic-key"] || DEFAULT_MAGIC_KEY);
  hinter = new Hinter(document, configValues["hints"] || DEFAULT_HINTS);

  setupEvents(window);
}

function setupEvents(window: any) {
  function hookKeydown(event: KeyboardEvent) {
    if (hinter.status === HinterStatus.NO_HINT) {
      if (!isEditable(event.target) && eventMatcher.test(event)) {
        event.preventDefault();
        event.stopPropagation();
        hinter.attachHints();
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
        eventMatcher.testModInsensitive(event)) {
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

  new HintsView(window, hinter);
}

function isEditable(elem: EventTarget) {
  if (!(elem instanceof HTMLElement)) return false;
  return elem.selectionStart != null || elem.contentEditable === "true";
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
  constructor(win: any, hinter: Hinter) {
    const doc: Document = win.document;
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
      border: "0px", padding: "0px", margin: "0px",
      display: "block",
      position: "absolute",
      zIndex: Z_INDEX_OFFSET.toString(),
    });

    const activeOverlay = container.appendChild(document.createElement("div"));
    activeOverlay.id = ACTIVE_OVERLAY_ID;
    Object.assign(activeOverlay.style, {
      border: "0px", padding: "0px", margin: "0px",
      display: "none",
      position: "absolute",
      zIndex: Z_INDEX_OFFSET.toString(),
    });

    let wrapper: ?HTMLDivElement;
    let hints: ?Hint[];
    let style: ?HTMLElement;

    hinter.onHinted.listen(() => {
      chrome.runtime.sendMessage("init");

      fitOverlay(win, overlay);
      activeOverlay.style.display = "none";

      const o = generateHints(hinter.hints);
      wrapper = o.wrapper;
      hints = o.hints;
      container.appendChild(wrapper);
      style = generateStyle(win);
      container.appendChild(style);
      doc.body.insertBefore(container, doc.body.firstChild);
    });
    hinter.onHintHit.listen((inputs) => {
      if (hints == null) throw Error("Illegal state");
      highligtHints(hints, inputs.join(""));
      moveOverlay(win, overlay, hints);
      moveActiveOverlay(win, activeOverlay, hints);
    });
    hinter.onDehinted.listen((opts) => {
      if (wrapper == null || style == null || hints == null) throw Error("Illegal state");
      const hitHint = hints.find((h) => h.state === "hit");
      handleHitTarget(hitHint, opts);
      doc.body.removeChild(container);
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
    if (!element.hasAttribute("tabindex")) element.setAttribute("tabindex", "-1");
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
  for (const type of ["mouseover", "mousedown", "mouseup", "click"]) {
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

function moveActiveOverlay(win: any, activeOverlay: HTMLDivElement, hints: Hint[]) {
  const hit = hints.find((h) => h.isHit());
  if (!hit) {
    activeOverlay.style.display = "none";
    return;
  }

  const rect = hit.target.element.getBoundingClientRect();
  const offsetY = win.scrollY;
  const offsetX = win.scrollX;

  Object.assign(activeOverlay.style, {
    top: `${rect.top + offsetY}px`,
    left: `${rect.left + offsetX}px`,
    height: `${Math.round(rect.height)}px`,
    width: `${Math.round(rect.width)}px`,
    display: "block",
  });

  console.log(hit.target.element, activeOverlay);
}

function moveOverlay(win: any, overlay: HTMLDivElement, hints: Hint[]) {
  const scrollHeight = win.document.body.scrollHeight;
  const scrollWidth = win.document.body.scrollWidth;
  const offsetY = win.scrollY;
  const offsetX = win.scrollX;
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
  });
}

function generateStyle(win: any): HTMLElement {
  const s = win.document.createElement("style");
  (s: any).scoped = true;
  s.textContent = css;
  return s;
}

function highligtHints(hints: Hint[], inputs: string) {
  for (const hint of hints) {
    hint.match(inputs);
  }
}

function fitOverlay(win: any, overlay: HTMLDivElement) {
  Object.assign(overlay.style, {
    top: `${win.scrollY}px`,
    left: `${win.scrollX}px`,
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
    const top = rect.top < 0 ? 0 : rect.top;
    const left = rect.left < 0 ? 0 : rect.left;
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

declare interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

declare type Target = {
  element: HTMLElement;
  rects: Rect[];
  mightBeClickable: boolean;
  filteredOutBy?: Target;
};

declare class HTMLMapElement extends HTMLElement {
  name: string;
}
declare class HTMLAreaElement extends HTMLElement {
  coords: string;
  shape: string;
}

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

    const rects = getVisibleRects(element);
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

    const parentTarget = first(flatMap(traverseParent(target.element), (p) => {
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
      if (targetMap.has(n)) return true;
      if (getVisibleRects(n).length >= 1) return true;
      return false;
    }
    return true;
  }

  // Filter out targets that is only one child for a parent target element.
  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    if (!target.mightBeClickable) continue;
    if (target.filteredOutBy) continue;

    const thinAncestors = takeWhile(traverseParent(target.element), (e) => {
      return length(filter(e.childNodes, isVisibleNode)) === 1;
    });
    const parentTarget = first(flatMap(thinAncestors, (p) => {
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

    const childNodes = Array.from(filter(target.element.childNodes, isVisibleNode));
    if (childNodes.every((c) => targetMap.has((c: any)))) {
      const child = childNodes[0];
      target.filteredOutBy = targetMap.get((child: any));
      console.debug("filter out: only targets containing: target=%o", target.element);
    }
  }

  return targets.filter((t) => t.filteredOutBy == null);
}

const RECT_POSITIONS = [[0.5, 0.5], [0.1, 0.1], [0.1, 0.9], [0.9, 0.1], [0.9, 0.9]];

function getVisibleRects(elem: HTMLElement): Rect[] {
  const innerWidth = window.innerWidth;
  const innerHeight = window.innerHeight;
  const rects = [];
  const clientRects = elem.tagName === "AREA"
        ? getAreaRects((elem: any)) // force cast
        : elem.getClientRects();
  for (const r of clientRects) {
    const { width, height, top, bottom, left, right } = r;

    // too small rects
    if (width <= 2 && height <= 2) continue;

    // out of display
    if (bottom <= 0 && top >= innerHeight &&
        right <= 0  && left >= innerWidth) continue;

    // is clickable element?
    // Actualy `isHintable` needs this check only.
    // However two former checks might be faster than this.
    for (const [xr, yr] of RECT_POSITIONS) {
      const x = avg(left, right, xr);
      const y = avg(top,  bottom, yr);

      let pointedElem = document.elementFromPoint(x, y);
      if (pointedElem == null) continue;

      // Traverse into shadow DOMs
      while (pointedElem.shadowRoot) {
        const elemInShadow = pointedElem.shadowRoot.elementFromPoint(x, y);
        if (elemInShadow) {
          pointedElem = elemInShadow;
        } else {
          break;
        }
      }

      if (elem === pointedElem || elem.contains(pointedElem)) {
        rects.push(r);
        // break;
        return [r]; // return only one rect
      }
    }
  }
  return rects;
}

function getAreaRects(element: HTMLAreaElement): Rect[] {
  const map = first(filter(traverseParent(element),
                           (e) => e.tagName === "MAP"));
  if (!(map instanceof HTMLMapElement)) return [];

  const img = document.querySelector(`body /deep/ img[usemap="#${map.name}"]`);
  if (!img) return [];

  const rect = img.getBoundingClientRect();

  if (element.shape === "default") return [rect];

  const coords = element.coords.split(",").map((c) => parseInt(c));
  // filter out NaN
  if (coords.some((c) => !(c >= 0))) return [];

  if (element.shape === "circle") {
    const [x, y, r] = coords;
    const d = r / Math.sqrt(2);
    const left  = x - d + rect.left;
    const right = x + d + rect.left;
    const top    = y - d + rect.top;
    const bottom = y + d + rect.top;
    return [{ left, right, top, bottom, width: right - left, height: bottom - top }];
  }

  // TODO poly support
  const [x1, y1, x2, y2] = coords;
  const left  = (x1 > x2 ? x2 : x1) + rect.left;
  const right = (x1 < x2 ? x2 : x1) + rect.left;
  const top    = (y1 > y2 ? y2 : y1) + rect.top;
  const bottom = (y1 < y2 ? y2 : y1) + rect.top;
  return [{ left, right, top, bottom, width: right - left, height: bottom - top }];
}

function filterOutBlankTextNode(iter: Iterator<Node> | Iterable<Node>): Node[] {
  return Array.from(filter(iter, (node) => !((node instanceof Text) && (/^\s*$/).test(node.textContent))));
}

function *traverseParent(element: Element, includeSelf?: boolean): Iterator<Element> {
  let p = includeSelf ? element : element.parentElement;
  while (p != null) {
    yield p;
    p = p.parentElement;
  }
}

function *traverseFirstChild(element: HTMLElement, includeSelf?: boolean): Iterator<HTMLElement> {
  let c: HTMLElement[] | HTMLCollection<HTMLElement> = includeSelf ? [element] : element.children;
  while (c.length >= 1) {
    yield c[0];
    c = c[0].children;
  }
}

function *takeWhile<T>(iter: Iterator<T> | Iterable<T>, p: (t: T) => boolean): Iterator<T> {
  for (const e of iter) {
    if (!p(e)) break;
    yield e;
  }
}

function reduce<T, U>(i: Iterable<T> | Iterator<T>, m: (u: U, t: T) => U, initValue: U): U {
  let u = initValue;
  for (const e of i) u = m(u, e);
  return u;
}

function length<T>(i: Iterable<T> | Iterator<T>): number {
  return reduce(i, (n) => n++, 0);
}

function first<T>(i: Iterator<T> | Iterable<T>): ?T {
  for (const e of i) return e;
  return null;
}

function head<T>(iter: Iterator<T> | Iterable<T>, n: number): Iterator<T> {
  let i = 0;
  return takeWhile(iter, () => i++ < n);
}

function avg(a: number, b: number, ratio: number): number {
  return a * ratio + b * (1 - ratio);
}

function* concat<T>(...i: Array<Iterable<T> | Iterator<T>>): Iterator<T> {
  for (const ii of i) for (const e of ii) yield e;
}

function* filter<T>(i: Iterable<T> | Iterator<T>, p: (t: T) => boolean): Iterator<T> {
  for (const e of i) if (p(e)) yield e;
}

function* map<T, U>(i: Iterable<T> | Iterator<T>, m: (t: T) => U): Iterable<U> {
  for (const e of i) yield m(e);
}

function* flatMap<T, U>(i: Iterable<T> | Iterator<T>, m: (t: T) => Iterable<U> | Iterator<U>): Iterable<U> {
  for (const e of i) for (const u of m(e)) yield u;
}

function distinct<T>(i: Iterable<T> | Iterator<T>): Iterable<T> {
  const s = new Set();
  return filter(i, (e) => {
    if (s.has(e)) return false;
    s.add(e);
    return true;
  });
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
