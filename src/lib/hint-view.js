import * as utils from "./utils.js";
import * as vp from "./viewports.js";
import settingsClient from "./settings-client.js";
import { subscribe } from "./chrome-messages.js";
import { waitUntil } from "./utils.js";
import { getBoundingRect } from "./rects.js";

const OVERLAY_PADDING = 8;
const CONTAINER_ID = "jp-k-ui-knavi-container";
const OVERLAY_ID = "overlay";
const ACTIVE_OVERLAY_ID = "active-overlay";
const HINT_CLASS = "hint";
const Z_INDEX_OFFSET = 2147483640;

export default class HintView {
  constructor() {
    (async () => {
      const container = document.createElement("div");
      container.id = CONTAINER_ID;
      const root = container.attachShadow({
        mode: "open",
        deletesFocus: false
      });
      const overlay = root.appendChild(document.createElement("div"));
      overlay.id = OVERLAY_ID;
      const activeOverlay = root.appendChild(document.createElement("div"));
      activeOverlay.id = ACTIVE_OVERLAY_ID;
      const style = root.appendChild(document.createElement("style"));

      const settings = await settingsClient.get();
      style.textContent = settings.css;
      settingsClient.subscribe(settings => {
        style.textContent = settings.css;
      });

      let hints;

      // wait event setup until document.body.firstChild is reachable.
      while (!(document.body && document.body.firstChild))
        await utils.nextAnimationFrame();

      subscribe("StartHinting", () => {
        hints = new Hints();

        waitUntil(() => Boolean(document.body)).then(() => {
          const body = document.body;
          initStyles(body, container, overlay, activeOverlay);
          body.insertBefore(container, body.firstChild);
        });
      });
      subscribe("NewTargets", ({ newTargets }) => {
        if (hints == null) return;
        const df = document.createDocumentFragment();
        for (const hint of generateHintElements(newTargets)) {
          hints.add(hint);
          hint.elements.forEach(e => df.appendChild(e));
        }
        root.appendChild(df);

        const first = newTargets[0];
        if (first && first.holder.frameId === 0) {
          container.style.display = "block";
        }
      });
      subscribe("EndHinting", () => {
        if (!container.contentDocument) return;
        container.style.display = "block";
      });
      subscribe(
        "AfterHitHint",
        ({ context, stateChanges, actionDescriptions }) => {
          if (!hints) throw Error("Illegal state");
          highligtHints(hints, stateChanges, actionDescriptions);
          moveOverlay(overlay, context.targets);
          moveActiveOverlay(activeOverlay, context.hitTarget);
        }
      );
      subscribe("AfterRemoveHints", () => {
        if (!hints) throw Error("Illegal state");
        waitUntil(() => Boolean(document.body)).then(() => {
          const body = document.body;
          if (body.contains(container)) {
            body.removeChild(container);
          }
        });
        removeAllHints(root, hints);
      });
    })();
  }
}

class Hints {
  constructor() {
    this.map = new Map();
  }
  get(t) {
    const { index, frameId } = t.holder;
    const hmap = this.map.get(frameId);
    if (hmap) {
      return hmap.get(index);
    }
    return null;
  }
  add(h) {
    const { index, frameId } = h.target.holder;
    let hmap = this.map.get(frameId);
    if (!hmap) {
      hmap = new Map();
      this.map.set(frameId, hmap);
    }
    hmap.set(index, h);
  }
  *all() {
    for (const [, m] of this.map) {
      for (const [, h] of m) {
        yield h;
      }
    }
  }
}

function initStyles(body, container, overlay, activeOverlay) {
  const vvpOffsets = vp.visual.offsets();
  const vvpSizes = vp.visual.sizes();
  const bodyPosition = window.getComputedStyle(document.body).position;
  let bodyOffsets;
  if (bodyPosition === "static") {
    bodyOffsets = { x: 0, y: 0 };
  } else {
    const bodyRect = vp.getBoundingClientRectFromRoot(body);
    bodyOffsets = { y: bodyRect.top, x: bodyRect.left };
  }

  Object.assign(container.style, {
    position: "absolute",
    top: px(vvpOffsets.y - bodyOffsets.y),
    left: px(vvpOffsets.x - bodyOffsets.x),
    width: px(vvpSizes.width),
    height: px(vvpSizes.height),
    background: "display",
    border: "0",
    outline: "0",
    padding: "0",
    margin: "0",
    overflow: "hidden",
    zIndex: Z_INDEX_OFFSET.toString(),
    display: "none"
  });
  Object.assign(overlay.style, {
    position: "absolute",
    padding: "0",
    margin: "0",
    top: "0",
    left: "0",
    width: "100%",
    height: "100%",
    display: "block"
  });
  Object.assign(activeOverlay.style, {
    position: "absolute",
    padding: "0",
    margin: "0",
    top: "0",
    left: "0",
    width: "0",
    height: "0",
    display: "none"
  });
}

function moveActiveOverlay(activeOverlay, hitTarget) {
  if (!hitTarget) {
    activeOverlay.style.display = "none";
    return;
  }

  const rect = getBoundingRect(hitTarget.holder.rects);

  Object.assign(activeOverlay.style, {
    top: px(rect.top),
    left: px(rect.left),
    height: px(rect.height),
    width: px(rect.width),
    display: "block"
  });
}

function moveOverlay(overlay, targets) {
  const vpSizes = vp.visual.sizes();

  let hasHitOrCand = false;
  const rr = { top: vpSizes.height, left: vpSizes.width, bottom: 0, right: 0 };
  for (const target of targets) {
    if (target.state === "disabled") continue;
    hasHitOrCand = true;

    const rect = getBoundingRect(target.holder.rects);
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
    display: "block"
  });
}

function highligtHints(hints, changes, actionDescriptions) {
  for (const { target, oldState, newState } of changes) {
    const hint = hints.get(target);
    if (hint == null) continue;
    for (const e of hint.elements) {
      e.dataset.state = newState;

      if (newState === "hit" && actionDescriptions) {
        e.setAttribute("data-action-description", actionDescriptions.short);
        if (actionDescriptions.long)
          e.setAttribute(
            "data-long-action-description",
            actionDescriptions.long
          );
      }
      if (oldState === "hit") {
        e.removeAttribute("data-action-description");
        e.removeAttribute("data-long-action-description");
      }
    }
  }
}

function generateHintElements(targets) {
  const hints = targets.reduce((arr, target) => {
    const elements = buildHintElements(target);
    arr.push({ elements, target });
    return arr;
  }, []);
  console.debug(
    "hints[%d]: %o",
    hints.length,
    hints.reduce((o, h) => {
      o[h.target.hint] = h;
      return o;
    }, {})
  );
  return hints;
}

function buildHintElements(target) {
  // Hinting for all client rects are annoying
  // const rects = target.rects;
  const rects = target.holder.rects.slice(0, 1);
  return rects.map(rect => {
    const h = document.createElement("div");
    h.textContent = target.hint;
    h.dataset["hint"] = target.hint;
    Object.assign(h.style, {
      position: "absolute",
      display: "block",
      top: px(rect.top),
      left: px(rect.left)
    });
    h.classList.add(HINT_CLASS);
    return h;
  });
}

function removeAllHints(root, hints) {
  for (const h of hints.all()) {
    for (const e of h.elements) {
      root.removeChild(e);
    }
  }
}

function px(n) {
  return `${Math.round(n)}px`;
}
