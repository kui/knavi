// @flow

import * as iters from "./iters";
import Hinter from "./hinter";

import type { HintedTarget, TargetStateChanges } from "./hinter";

const OVERLAY_PADDING = 8;
const CONTAINER_ID = "jp-k-ui-knavi";
const OVERLAY_ID = "jp-k-ui-knavi-overlay";
const ACTIVE_OVERLAY_ID = "jp-k-ui-knavi-active-overlay";
const HINT_CLASS = "jp-k-ui-knavi-hint";
const Z_INDEX_OFFSET = 2147483640;

declare class Object {
  static assign: Object$Assign;
}

declare type Hint = {
  elements: HTMLDivElement[];
  target: HintedTarget;
}

export default class HintsView {
  constructor(hinter: Hinter, css: string) {
    const container = document.createElement("div");
    container.id = CONTAINER_ID;
    Object.assign(container.style, {
      position: "absolute",
      padding: "0px", margin: "0px",
      width:  "100%", height: "100%",
      background: "none",
      zIndex: Z_INDEX_OFFSET.toString(),
    });

    const overlay = container.appendChild(document.createElement("div"));
    overlay.id = OVERLAY_ID;
    Object.assign(overlay.style, {
      padding: "0px", margin: "0px",
      display: "block",
      position: "absolute",
    });

    const activeOverlay = container.appendChild(document.createElement("div"));
    activeOverlay.id = ACTIVE_OVERLAY_ID;
    Object.assign(activeOverlay.style, {
      padding: "0px", margin: "0px",
      display: "none",
      position: "absolute",
    });

    let wrapper: ?HTMLDivElement;
    let style: ?HTMLElement;
    let hints: ?Map<HintedTarget, Hint>;

    hinter.onHinted.listen(({ context }) => {
      fitOverlay(overlay);
      activeOverlay.style.display = "none";

      wrapper = document.createElement("div");
      hints = generateHintElements(wrapper, context.targets);
      style = generateStyle(css);

      container.appendChild(wrapper);
      container.appendChild(style);
      document.body.insertBefore(container, document.body.firstChild);
    });
    hinter.onHintHit.listen(({ context, stateChanges, actionDescriptions }) => {
      if (!hints) throw Error("Illegal state");
      const shortDescription = actionDescriptions && actionDescriptions.short;
      highligtHints(hints, stateChanges, shortDescription);
      moveOverlay(overlay, context.targets);
      moveActiveOverlay(activeOverlay, context.hitTarget);
    });
    hinter.onDehinted.listen(() => {
      if (!hints || !wrapper || !style) throw Error("Illegal state");
      document.body.removeChild(container);
      container.removeChild(wrapper);
      container.removeChild(style);
      wrapper = null;
      style = null;
      hints = null;
    });
  }
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

function generateStyle(css: string): HTMLElement {
  const s = document.createElement("style");
  s.textContent = css;
  return s;
}

function highligtHints(hints: Map<HintedTarget, Hint>,
                       changes: TargetStateChanges,
                       actionDescription: ?string) {
  for (const [target, { oldState, newState }] of changes.entries()) {
    const hint = hints.get(target);
    if (hint == null) continue;
    for (const e of hint.elements) {
      e.dataset.state = newState;

      if (newState === "hit" && actionDescription) {
        e.setAttribute("data-action-description", actionDescription);
      }
      if (oldState === "hit") {
        e.removeAttribute("data-action-description");
      }
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

  // Hinting for all client rects are annoying
  // const rects = target.rects;
  const rects = target.rects.slice(0, 1);

  return rects.map((rect) => {
    const h = document.createElement("div");
    h.textContent = target.hint.toUpperCase();
    h.dataset["hint"] = target.hint;
    const top = Math.max(rect.top, 0);
    const left = Math.max(rect.left, 0);
    Object.assign(h.style, {
      position: "absolute",
      display: "block",
      top: Math.round(yOffset + top) + "px",
      left: Math.round(xOffset + left) + "px",
    });
    h.classList.add(HINT_CLASS);
    return h;
  });
}
