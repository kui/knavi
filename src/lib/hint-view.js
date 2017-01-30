// @flow

import * as iters from "./iters";
import * as utils from "./utils";
import * as vp from "./viewports";
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

      let hints: Map<Target, Hint>;

      // wait event setup untill document.body.firstChild is reachable.
      while (!(document.body && document.body.firstChild)) await utils.nextAnimationFrame();

      hinter.onStartHinting.listen(() => {
        initStyles(container, overlay, activeOverlay);
        document.body.insertBefore(container, document.body.firstChild);
        container.contentDocument.head.appendChild(style);
        container.contentWindow.onfocus = () => {
          if (document.body.contains(container)) {
            document.body.removeChild(container);
            return false;
          }
        };

        hints = new Map;
      });
      hinter.onNewTargets.listen(({ newTargets }) => {
        if (hints == null) return;
        const df = document.createDocumentFragment();
        for (const [k, v] of generateHintElements(newTargets)) {
          hints.set(k, v);
          v.elements.forEach((e) => df.appendChild(e));
        }
        container.contentDocument.body.appendChild(df);
      });
      hinter.onEndHinting.listen(() => {
        if (!container.contentDocument) return;
        container.style.display = "block";
        const body = container.contentDocument.body;
        body.insertBefore(activeOverlay, body.firstChild);
        body.insertBefore(overlay, body.firstChild);
      });
      hinter.onHintHit.listen(({ context, stateChanges, actionDescriptions }) => {
        if (!hints) throw Error("Illegal state");
        const shortDescription = actionDescriptions && actionDescriptions.short;
        highligtHints(hints, stateChanges, shortDescription);
        moveOverlay(overlay, context.targets);
        moveActiveOverlay(activeOverlay, context.hitTarget);
      });
      hinter.onDehinted.listen(() => {
        if (!hints) throw Error("Illegal state");
        if (document.body.contains(container)) {
          document.body.removeChild(container);
        }
      });
    })();
  }
}

function initStyles(container: HTMLElement,
                    overlay: HTMLElement,
                    activeOverlay: HTMLElement) {
  const vvpOffsets = vp.visual.offsets();
  const vvpSizes = vp.visual.sizes();
  const bodyPosition = window.getComputedStyle(document.body).position;
  let bodyOffsets;
  if (bodyPosition === "static") {
    bodyOffsets = { x: 0, y: 0 };
  } else {
    const bodyRect = vp.getBoundingClientRectFromRoot(document.body);
    bodyOffsets = { y: bodyRect.top, x: bodyRect.left };
  }

  Object.assign(container.style, {
    position: "absolute",
    padding: "0", margin: "0",
    top:  px(vvpOffsets.y - bodyOffsets.y),
    left: px(vvpOffsets.x - bodyOffsets.x),
    width:  px(vvpSizes.width),
    height: px(vvpSizes.height),
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
    display: "block"
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
  const vpSizes = vp.visual.sizes();

  let hasHitOrCand = false;
  const rr = { top: vpSizes.height, left: vpSizes.width, bottom: 0, right: 0 };
  for (const target of targets) {
    if (target.state === "disabled") continue;
    hasHitOrCand = true;

    const rect = utils.getBoundingRect(target.holder.rects);
    rr.top = Math.min(rr.top, rect.top);
    rr.bottom = Math.max(rr.bottom, rect.bottom);
    rr.left = Math.min(rr.left, rect.left);
    rr.right = Math.max(rr.right, rect.right);
  }

  if (!hasHitOrCand) {
    overlay.style.display = "none";
    return;
  }

  // padding
  rr.top = Math.max(rr.top - OVERLAY_PADDING, 0);
  rr.bottom = Math.min(rr.bottom + OVERLAY_PADDING, vpSizes.height);
  rr.left = Math.max(rr.left - OVERLAY_PADDING, 0);
  rr.right = Math.min(rr.right + OVERLAY_PADDING, vpSizes.width);

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

function generateHintElements(targets: Target[]): Map<Target, Hint> {
  const hints = targets.reduce((m, target) => {
    const elements = buildHintElements(target);
    m.set(target, { elements, target });
    return m;
  }, new Map);
  console.debug("hints[%d]: %o", hints.size, iters.reduce(hints.values(), (o, h) => {
    o[h.target.hint] = h;
    return o;
  }, {}));
  return hints;
}

function buildHintElements(target: Target): HTMLDivElement[] {
  // Hinting for all client rects are annoying
  // const rects = target.rects;
  const rects = target.holder.rects.slice(0, 1);

  return rects.map((rect) => {
    const h = document.createElement("div");
    h.textContent = target.hint;
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
