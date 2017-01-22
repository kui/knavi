// @flow

import * as iters from "./iters";
import * as utils from "./utils";
import Hinter from "./hinter";

import type { Target, TargetStateChanges } from "./hinter";

const OVERLAY_PADDING = 8;
const CONTAINER_ID = "jp-k-ui-knavi";
const OVERLAY_ID = "jp-k-ui-knavi-overlay";
const ACTIVE_OVERLAY_ID = "jp-k-ui-knavi-active-overlay";
const HINT_CLASS = "jp-k-ui-knavi-hint";
const Z_INDEX_OFFSET = 2147483640;

declare type Hint = {
  elements: HTMLDivElement[];
  target: Target;
}

export default class HintsView {
  constructor(hinter: Hinter, css: string) {
    const container = document.createElement("div");
    container.id = CONTAINER_ID;
    const overlay = container.appendChild(document.createElement("div"));
    overlay.id = OVERLAY_ID;
    const activeOverlay = container.appendChild(document.createElement("div"));
    activeOverlay.id = ACTIVE_OVERLAY_ID;

    let wrapper: ?HTMLDivElement;
    let style: ?HTMLElement;
    let hints: ?Map<Target, Hint>;

    (async () => {
      // wait event setup untill document.body.firstChild is reachable.
      while (!(document.body && document.body.firstChild)) await utils.nextAnimationFrame();

      hinter.onStartHinting.listen(() => {
        initStyles(container, overlay, activeOverlay);

        wrapper = document.createElement("div");
        hints = new Map;
        style = generateStyle(css);

        container.appendChild(wrapper);
        container.appendChild(style);
        document.body.insertBefore(container, document.body.firstChild);
      });
      hinter.onNewTargets.listen(({ newTargets }) => {
        if (wrapper == null || hints == null) return;
        for (const [k, v] of generateHintElements(wrapper, newTargets)) {
          hints.set(k, v);
        }
      });
      hinter.onEndHinting.listen(() => {
        fitOverlay(container, overlay);
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
    })();
  }
}

function fitOverlay(container, overlay) {
  Object.assign(container.style, {
    width:  "100%", height: "100%",
    display: "block",
  });
  Object.assign(overlay.style, {
    top: `${window.scrollY}px`,
    left: `${window.scrollX}px`,
    width:  "100%", height: "100%",
    display: "block",
  });
}

function moveActiveOverlay(activeOverlay: HTMLDivElement, hitTarget: ?Target) {
  if (!hitTarget) {
    activeOverlay.style.display = "none";
    return;
  }

  const rect = utils.getBoundingRect(hitTarget.holder.rects);
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

function moveOverlay(overlay: HTMLDivElement, targets: Target[]) {
  const scrollHeight = document.body.scrollHeight;
  const scrollWidth = document.body.scrollWidth;
  const offsetY = window.scrollY;
  const offsetX = window.scrollX;
  let hasHitOrCand = false;
  const rr = { top: scrollHeight, left: scrollWidth, bottom: 0, right: 0 };
  for (const target of targets) {
    if (target.state === "disabled") continue;
    hasHitOrCand = true;

    const rect = utils.getBoundingRect(target.holder.rects);
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

function highligtHints(hints: Map<Target, Hint>,
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

function initStyles(container: HTMLDivElement,
                    overlay: HTMLDivElement,
                    activeOverlay: HTMLDivElement) {
  Object.assign(container.style, {
    position: "absolute",
    padding: "0", margin: "0",
    top: "0", left: "0",
    width: "0", height: "0",
    background: "display",
    zIndex: Z_INDEX_OFFSET.toString(),
  });
  Object.assign(overlay.style, {
    position: "absolute",
    padding: "0", margin: "0",
    top: "0", left: "0",
    width: "0", height: "0",
    display: "none",
  });
  Object.assign(activeOverlay.style, {
    position: "absolute",
    padding: "0", margin: "0",
    top: "0", left: "0",
    width: "0", height: "0",
    display: "none",
  });
}

function generateHintElements(wrapper: HTMLDivElement, targets: Target[]): Map<Target, Hint> {
  const df = document.createDocumentFragment();
  const hints = targets.reduce((m, target) => {
    const elements = buildHintElements(target);
    elements.forEach((e) => df.appendChild(e));
    m.set(target, { elements, target });
    return m;
  }, new Map);
  console.debug("hints[%d]: %o", hints.size, iters.reduce(hints.values(), (o, h) => {
    o[h.target.hint] = h;
    return o;
  }, {}));
  wrapper.appendChild(df);
  return hints;
}

function buildHintElements(target: Target): HTMLDivElement[] {
  const xOffset = window.scrollX;
  const yOffset = window.scrollY;

  // Hinting for all client rects are annoying
  // const rects = target.rects;
  const rects = target.holder.rects.slice(0, 1);

  return rects.map((rect) => {
    const h = document.createElement("div");
    h.textContent = target.hint.toUpperCase();
    h.dataset["hint"] = target.hint;
    Object.assign(h.style, {
      position: "absolute",
      display: "block",
      top: Math.round(yOffset + rect.top) + "px",
      left: Math.round(xOffset + rect.left) + "px",
    });
    h.classList.add(HINT_CLASS);
    return h;
  });
}
