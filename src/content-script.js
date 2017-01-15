// @flow

import EventMatcher from "key-input-elements/lib/event-matcher";
import { EventEmitter } from "./lib/event-emitter";
import { config } from "./lib/config";
import * as utils from "./lib/utils";
import * as iters from "./lib/iters";
import Hinter from "./lib/hinter";

import type { HintedTarget, DehintOptions, TargetState, TargetStateChanges } from "./lib/hinter";

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
const BLUR_MESSAGE = "jp-k-ui-knavi-blur";

let hitEventMatcher: EventMatcher;
let blurEventMatcher: EventMatcher;
let hinter: Hinter;
let css: string;

async function main(window: any) {
  const configValues = await config.get();
  console.debug("config: ", configValues);

  hitEventMatcher = new EventMatcher(configValues["magic-key"] || DEFAULT_MAGIC_KEY);
  blurEventMatcher = new EventMatcher(configValues["blur-key"] || "");
  hinter = new Hinter(configValues["hints"] || DEFAULT_HINTS);
  css = configValues["css"] || DEFAULT_STYLE;

  // wait event setup untill document.body.firstChild is reachable.
  while (!(document.body && document.body.firstChild)) await utils.nextTick();

  setupEvents(window);
}

function setupEvents(window: any) {
  const blurEvents = new EventEmitter();
  function hookKeydown(event: KeyboardEvent) {
    if (hinter.isHinting()) {
      event.preventDefault();
      event.stopPropagation();
      hinter.hitHint(event.key);
    } else {
      if (!isEditable(event.target) && hitEventMatcher.test(event)) {
        event.preventDefault();
        event.stopPropagation();
        hinter.attachHints();
      } else if (blurEventMatcher.test(event)) {
        if (isBlurable()) {
          event.preventDefault();
          event.stopPropagation();
          console.debug("blur", document.activeElement);
          blurEvents.emit(document.activeElement);
          document.activeElement.blur();
        } else if (isInFrame()) {
          event.preventDefault();
          event.stopPropagation();
          console.debug("blur form the current frame", window.document.body);
          window.parent.postMessage(BLUR_MESSAGE, "*");
        }
      }
      return;
    }
  }
  function hookKeyup(event: KeyboardEvent) {
    if (hinter.isHinting() && hitEventMatcher.testModInsensitive(event)) {
      event.preventDefault();
      event.stopPropagation();
      hinter.removeHints(event);
    }
  }
  function hookKeypress(event: KeyboardEvent) {
    if (hinter.isHinting()) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  window.addEventListener("keydown", hookKeydown, true);
  window.addEventListener("keyup", hookKeyup, true);
  window.addEventListener("keypress", hookKeypress, true);

  // Blur request from a child frame
  window.addEventListener("message", (e) => {
    if (e.data === BLUR_MESSAGE) {
      console.debug("blur request from a frame", e.source);
      blurEvents.emit(document.activeElement);
      document.activeElement.blur();
    }
  });

  new HintsView(hinter);
  new BlurView(blurEvents);
}

function isEditable(elem: EventTarget) {
  if (!(elem instanceof HTMLElement)) return false;
  // No-selectable <input> throws an error when "selectionStart" are referred.
  let selectionStart;
  try {
    selectionStart = (elem: any).selectionStart;
  } catch (e) {
    return false;
  }
  return selectionStart != null || elem.contentEditable === "true";
}

function isBlurable() {
  return document.activeElement !== document.body;
}

function isInFrame() {
  return window.parent !== window;
}

//

declare class Object {
  static assign: Object$Assign;
}

declare type Hint = {
  elements: HTMLDivElement[];
  target: HintedTarget;
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
    let style: ?HTMLElement;
    let hints: ?Map<HintedTarget, Hint>;

    hinter.onHinted.listen(({ context }) => {
      fitOverlay(overlay);
      activeOverlay.style.display = "none";

      wrapper = generateHintsWrapper();
      hints = generateHintElements(wrapper, context.targets);
      style = generateStyle();

      container.appendChild(wrapper);
      container.appendChild(style);
      document.body.insertBefore(container, document.body.firstChild);
    });
    hinter.onHintHit.listen(({ context, stateChanges }) => {
      if (!hints) throw Error("Illegal state");
      highligtHints(hints, stateChanges);
      moveOverlay(overlay, context.targets);
      moveActiveOverlay(activeOverlay, context.hitTarget);
    });
    hinter.onDehinted.listen(({ context, options }) => {
      if (!hints || !wrapper || !style) throw Error("Illegal state");
      handleHitTarget(context.hitTarget, options);
      document.body.removeChild(container);
      container.removeChild(wrapper);
      container.removeChild(style);
      wrapper = null;
      style = null;
      hints = null;
    });
  }
}

function generateHintsWrapper(): HTMLDivElement {
  const w = document.createElement("div");
  w.id = WRAPPER_ID;
  Object.assign(w.style, {
    position: "static",
  });
  return w;
}

function handleHitTarget(target: ?HintedTarget, options: DehintOptions) {
  if (!target) return;

  console.log("hit", target.element);

  const element = target.element;
  const style = window.getComputedStyle(element);
  if (isScrollable(element, style)) {
    // Make scrollable from your keyboard
    if (!element.hasAttribute("tabindex")) {
      element.setAttribute("tabindex", "-1");
      element.addEventListener(
        "blur",
        () => element.removeAttribute("tabindex"),
        { once: true }
      );
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

function moveActiveOverlay(activeOverlay: HTMLDivElement, hitTarget: ?HintedTarget) {
  if (!hitTarget) {
    activeOverlay.style.display = "none";
    return;
  }

  const rect = hitTarget.getBoundingClientRect();
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

function moveOverlay(overlay: HTMLDivElement, targets: HintedTarget[]) {
  const scrollHeight = document.body.scrollHeight;
  const scrollWidth = document.body.scrollWidth;
  const offsetY = window.scrollY;
  const offsetX = window.scrollX;
  let hasHitOrCand = false;
  const rr = { top: scrollHeight, left: scrollWidth, bottom: 0, right: 0 };
  for (const target of targets) {
    if (target.state === "disabled") continue;
    hasHitOrCand = true;

    const rect = target.getBoundingClientRect();

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
  rr.top = Math.max(rr.top - OVERLAY_PADDING, 0);
  rr.left = Math.max(rr.left - OVERLAY_PADDING, 0);
  rr.bottom = Math.min(rr.bottom + OVERLAY_PADDING, scrollHeight);
  rr.right = Math.min(rr.right + OVERLAY_PADDING, scrollWidth);

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

const HINT_Z_INDEXES: { [key: TargetState ]: number } = {
  "disabled": Z_INDEX_OFFSET,
  "candidate": CANDIDATE_HINT_Z_INDEX,
  "hit": HIT_HINT_Z_INDEX,
  "init": Z_INDEX_OFFSET,
};

function highligtHints(hints: Map<HintedTarget, Hint>, changes: TargetStateChanges) {
  for (const [target, { oldState, newState }] of changes.entries()) {
    const hint = hints.get(target);
    if (hint == null) continue;
    for (const e of hint.elements) {
      e.classList.remove(`jp-k-ui-knavi-${oldState}`);
      e.classList.add(`jp-k-ui-knavi-${newState}`);
      e.style.zIndex = HINT_Z_INDEXES[newState].toString();
    }
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

function generateHintElements(wrapper: HTMLDivElement, targets: HintedTarget[]): Map<HintedTarget, Hint> {
  const hints = targets.reduce((m, target) => {
    const elements = buildHintElements(target);
    elements.forEach((e) => wrapper.appendChild(e));
    m.set(target, { elements, target });
    return m;
  }, new Map);
  console.debug("hints[%d]: %o", hints.size, iters.reduce(hints.values(), (o, h) => {
    o[h.target.hint] = h;
    return o;
  }, {}));
  return hints;
}

function buildHintElements(target: HintedTarget): HTMLDivElement[] {
  const xOffset = window.scrollX;
  const yOffset = window.scrollY;

  return target.rects.map((rect) => {
    const h = document.createElement("div");
    h.textContent = target.hint.toUpperCase();
    h.dataset["hint"] = target.hint;
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

class BlurView {
  constructor(blurEvents: EventEmitter<HTMLElement>) {
    const overlay = document.createElement("div");
    Object.assign(overlay.style, {
      position: "absolute",
      display: "block",
      zIndex: Z_INDEX_OFFSET.toString(),
    });

    function removeOverlay() {
      if (document.body.contains(overlay)) {
        document.body.removeChild(overlay);
      }
    }

    blurEvents.listen((element) => {
      removeOverlay();

      const rect = element.getBoundingClientRect();
      Object.assign(overlay.style, {
        top:  `${window.scrollY + rect.top}px`,
        left: `${window.scrollX + rect.left}px`,
        height: `${rect.height}px`,
        width:  `${rect.width}px`,
      });
      document.body.insertBefore(overlay, document.body.firstChild);
      // $FlowFixMe
      const animation = overlay.animate([
        { boxShadow: "0 0   0    0 rgba(128,128,128,0.15), 0 0   0    0 rgba(0,0,128,0.1)" },
        { boxShadow: "0 0 3px 72px rgba(128,128,128,   0), 0 0 3px 80px rgba(0,0,128,  0)" },
      ], {
        duration: 200,
      });
      animation.addEventListener("finish", removeOverlay);
      window.addEventListener("keydown", removeOverlay, { once: true });
    });
  }
}

main(window);
