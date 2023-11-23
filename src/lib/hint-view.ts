import * as vp from "./viewports";
import { Router } from "./chrome-messages";
import { addPadding, getBoundingRect, intersection } from "./rects";
import { waitUntil } from "./animations";
import { flatMap, groupIntoObjectBy } from "./iters";
import { applyStyle } from "./elements";

interface HintElement {
  elements: HTMLElement[];
  target: HintTarget;
}

const OVERLAY_PADDING = 8;
const CONTAINER_ID = "com-github-kui-knavi-container";
const OVERLAY_ID = "overlay";
const ACTIVE_OVERLAY_ID = "active-overlay";
const HINT_CLASS = "hint";
const Z_INDEX_OFFSET = 2147483640;

export class HintView {
  private container: HTMLDivElement;
  private root: ShadowRoot;

  // Bounding rect of the hit and candidate elements.
  private overlay: HTMLDivElement;

  // Bounding rect of the hit element only.
  private activeOverlay: HTMLDivElement;

  private style: HTMLStyleElement;
  private hints: Hints | null = null;

  constructor() {
    this.container = document.createElement("div");
    this.container.id = CONTAINER_ID;

    this.root = this.container.attachShadow({ mode: "open" });

    this.overlay = this.root.appendChild(document.createElement("div"));
    this.overlay.id = OVERLAY_ID;

    this.activeOverlay = this.root.appendChild(document.createElement("div"));
    this.activeOverlay.id = ACTIVE_OVERLAY_ID;

    this.style = this.root.appendChild(document.createElement("style"));
  }

  setup(css: string) {
    this.style.textContent = css;
  }

  async render(targets: HintTarget[]) {
    await waitUntil(() => Boolean(document.body));
    const body = document.body;
    this.initStyles();
    body.insertBefore(this.container, body.firstChild);

    this.hints = new Hints();
    const df = document.createDocumentFragment();
    for (const hint of generateHintElements(targets)) {
      this.hints.add(hint);
      hint.elements.forEach((e) => df.appendChild(e));
    }
    this.root.appendChild(df);
  }

  private initStyles() {
    const vvpRect = vp.visual.rect();
    const bodyPosition = window.getComputedStyle(document.body).position;
    let bodyOffsets: Coordinates;
    if (bodyPosition === "static") {
      bodyOffsets = { x: 0, y: 0 };
    } else {
      bodyOffsets = vp.getBoundingClientRectFromRoot(document.body);
    }

    applyStyle(this.container, {
      position: "absolute",
      top: px(vvpRect.y - bodyOffsets.y),
      left: px(vvpRect.x - bodyOffsets.x),
      width: px(vvpRect.width),
      height: px(vvpRect.height),
      background: "display",
      border: "0",
      outline: "0",
      padding: "0",
      margin: "0",
      overflow: "hidden",
      zIndex: Z_INDEX_OFFSET.toString(),
      display: "block",
    });
    applyStyle(this.overlay, {
      position: "absolute",
      padding: "0",
      margin: "0",
      top: "0",
      left: "0",
      width: "100%",
      height: "100%",
      display: "block",
    });
    applyStyle(this.activeOverlay, {
      position: "absolute",
      padding: "0",
      margin: "0",
      top: "0",
      left: "0",
      width: "0",
      height: "0",
      display: "none",
    });
  }

  hit(changes: HintTarget[], actionDescriptions: ActionDescriptions | null) {
    if (!this.hints) throw Error("Illegal state");
    this.highlightHints(changes, actionDescriptions);
    this.moveOverlay();
    this.moveActiveOverlay(changes.find((t) => t.state === "hit") ?? null);
  }

  private highlightHints(
    changes: HintTarget[],
    actionDescriptions: ActionDescriptions | null,
  ) {
    for (const target of changes) {
      const hint = this.hints!.get(target);
      if (!hint) {
        console.warn("Illegal state: hint not found", target);
        continue;
      }

      for (const e of hint.elements) {
        const oldState = e.dataset.state;
        e.dataset.state = target.state;
        if (target.state === "hit" && actionDescriptions) {
          e.dataset.actionDescription = actionDescriptions.short;
          if (actionDescriptions.long)
            e.dataset.longActionDescription = actionDescriptions.long;
        }
        if (oldState === "hit") {
          delete e.dataset.actionDescription;
          delete e.dataset.longActionDescription;
        }
      }
    }
  }

  private moveOverlay() {
    const vpSizes = vp.visual.sizes();

    const hintRects = [
      ...flatMap(this.hints!.all(), ({ target }) => {
        if (target.state === "disabled") return [];
        return target.holder.rects;
      }),
    ];
    if (hintRects.length === 0) {
      this.overlay.style.display = "none";
      return;
    }
    const newOverlayRect = intersection(
      addPadding(getBoundingRect(hintRects), OVERLAY_PADDING),
      { x: 0, y: 0, ...vpSizes },
    );
    if (!newOverlayRect) {
      console.warn("Illegal state: newOverlayRect is null");
      this.overlay.style.display = "none";
      return;
    }
    applyStyle(this.overlay, { display: "block" }, styleRect(newOverlayRect));
  }

  private moveActiveOverlay(hitTarget: HintTarget | null) {
    if (!hitTarget) {
      this.activeOverlay.style.display = "none";
      return;
    }

    applyStyle(
      this.activeOverlay,
      { display: "block" },
      styleRect(getBoundingRect(hitTarget.holder.rects)),
    );
  }

  remove() {
    if (!this.hints) throw Error("Illegal state");

    document.body.removeChild(this.container);
    for (const e of flatMap(this.hints.all(), (h) => h.elements))
      this.root.removeChild(e);
    this.hints = null;
  }

  router() {
    return Router.newInstance()
      .add("RenderTargets", ({ targets }) => this.render(targets))
      .add("AfterHitHint", ({ changes, actionDescriptions }) =>
        this.hit(changes, actionDescriptions),
      )
      .add("AfterRemoveHints", () => this.remove());
  }
}

function styleRect(r: Rect) {
  return {
    top: px(r.y),
    left: px(r.x),
    height: px(r.height),
    width: px(r.width),
  };
}

class Hints {
  private map = new Map<
    // frameId
    number,
    Map<
      // index
      number,
      HintElement
    >
  >();

  get(t: HintTarget): HintElement | undefined {
    const { index, frameId } = t.holder;
    return this.map.get(frameId)?.get(index);
  }

  add(t: HintElement) {
    const { index, frameId } = t.target.holder;
    let hmap = this.map.get(frameId);
    if (!hmap) {
      hmap = new Map();
      this.map.set(frameId, hmap);
    }
    hmap.set(index, t);
  }

  *all() {
    for (const m of this.map.values()) yield* m.values();
  }
}

function generateHintElements(targets: HintTarget[]): HintElement[] {
  const hints = targets.map((target) => ({
    elements: buildHintElements(target),
    target,
  }));
  console.debug(
    "hints[%d]: %o",
    hints.length,
    groupIntoObjectBy(hints, (h) => h.target.hint),
  );
  return hints;
}

function buildHintElements(target: HintTarget): HTMLElement[] {
  // Currently, we use only the first rect because multiple hints are too noisy.
  // const rects = target.rects;
  const rects = target.holder.rects.slice(0, 1);
  return rects.map((rect) => {
    const h = document.createElement("div");
    h.textContent = target.hint;
    h.dataset.hint = target.hint;
    h.dataset.state = target.state;
    h.classList.add(HINT_CLASS);
    applyStyle(h, {
      position: "absolute",
      display: "block",
      left: px(rect.x),
      top: px(rect.y),
    });
    return h;
  });
}

function px(n: number): string {
  return `${Math.round(n)}px`;
}
