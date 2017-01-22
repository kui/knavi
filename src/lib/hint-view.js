// @flow

import * as iters from "./iters";
import * as utils from "./utils";
import Hinter from "./hinter";

import type { Target, TargetStateChanges } from "./hinter";

const OVERLAY_PADDING = 8;
const CONTAINER_ID = "jp-k-ui-knavi-container";
const OVERLAY_ID = "overlay";
const ACTIVE_OVERLAY_ID = "active-overlay";
const HINT_CLASS = "hint";
const Z_INDEX_OFFSET = 2147483640;

declare type Hint = {
  elements: HTMLDivElement[];
  target: Target;
}

export default class HintsView {
  constructor(hinter: Hinter, css: string) {
    (async () => {
      const container = document.createElement("iframe");
      container.id = CONTAINER_ID;
      const overlay = document.createElement("div");
      overlay.id = OVERLAY_ID;
      const activeOverlay = document.createElement("div");
      activeOverlay.id = ACTIVE_OVERLAY_ID;
      const style = document.createElement("style");
      style.textContent = css;

      let wrapper: HTMLDivElement;
      let hints: Map<Target, Hint>;

      // wait event setup untill document.body.firstChild is reachable.
      while (!(document.body && document.body.firstChild)) await utils.nextAnimationFrame();

      hinter.onStartHinting.listen(() => {
        initStyles(container, overlay, activeOverlay);
        document.body.insertBefore(container, document.body.firstChild);
        container.contentDocument.head.appendChild(style);
        container.contentDocument.body.appendChild(overlay);
        container.contentDocument.body.appendChild(activeOverlay);

        wrapper = document.createElement("div");
        hints = new Map;
        container.contentDocument.body.appendChild(wrapper);
      });
      hinter.onNewTargets.listen(({ newTargets }) => {
        if (wrapper == null || hints == null) return;
        for (const [k, v] of generateHintElements(wrapper, newTargets)) {
          hints.set(k, v);
        }
      });
      hinter.onEndHinting.listen(() => {
        container.style.display = "block";
      });
      hinter.onHintHit.listen(({ context, stateChanges, actionDescriptions }) => {
        if (!hints) throw Error("Illegal state");
        const shortDescription = actionDescriptions && actionDescriptions.short;
        highligtHints(hints, stateChanges, shortDescription);
        moveOverlay(overlay, context.targets);
        moveActiveOverlay(activeOverlay, context.hitTarget);
      });
      hinter.onDehinted.listen(() => {
        if (!hints || !wrapper) throw Error("Illegal state");
        document.body.removeChild(container);
      });
    })();
  }
}
function initStyles(container: HTMLElement,
                    overlay: HTMLElement,
                    activeOverlay: HTMLElement) {
  Object.assign(container.style, {
    position: "absolute",
    padding: "0", margin: "0",
    top: px(window.scrollY), left: px(window.scrollX),
    width: "100%", height: "100%",
    background: "display",
    border: "none",
    zIndex: Z_INDEX_OFFSET.toString(),
    display: "none",
  });
  Object.assign(overlay.style, {
    position: "absolute",
    padding: "0", margin: "0",
    top: "0", left: "0",
    width: "100%", height: "100%",
  });
  Object.assign(activeOverlay.style, {
    position: "absolute",
    padding: "0", margin: "0",
    top: "0", left: "0",
    width: "0", height: "0",
    display: "none",
  });
}

function moveActiveOverlay(activeOverlay: HTMLDivElement, hitTarget: ?Target) {
  if (!hitTarget) {
    activeOverlay.style.display = "none";
    return;
  }

  const rect = utils.getBoundingRect(hitTarget.holder.rects);

  Object.assign(activeOverlay.style, {
    top: px(rect.top),
    left: px(rect.left),
    height: px(rect.height),
    width: px(rect.width),
    display: "block",
  });
}

function moveOverlay(overlay: HTMLDivElement, targets: Target[]) {
  const scrollHeight = document.body.scrollHeight;
  const scrollWidth = document.body.scrollWidth;
  let hasHitOrCand = false;
  const rr = { top: scrollHeight, left: scrollWidth, bottom: 0, right: 0 };
  for (const target of targets) {
    if (target.state === "disabled") continue;
    hasHitOrCand = true;

    const rect = utils.getBoundingRect(target.holder.rects);
    rr.top = Math.min(rr.top, rect.top);
    rr.left = Math.min(rr.left, rect.left);
    rr.bottom = Math.max(rr.bottom, rect.bottom);
    rr.right = Math.max(rr.right, rect.right);
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
    top: px(rr.top),
    left: px(rr.left),
    height: px(rr.bottom - rr.top),
    width: px(rr.right - rr.left),
    display: "block",
  });
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
      top: px(rect.top),
      left: px(rect.left),
    });
    h.classList.add(HINT_CLASS);
    return h;
  });
}

function px(n: number) { return `${Math.round(n)}px`; }
