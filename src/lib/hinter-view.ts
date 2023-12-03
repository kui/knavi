import { waitUntil } from "./animations";
import {
  Z_INDEX_OFFSET,
  applyStyle,
  getPaddingRects,
  styleByRect,
} from "./elements";
import { flatMap } from "./iters";
import { Coordinates, Rect } from "./rects";
import * as vp from "./viewports";

const CONTAINER_ID = "com-github-kui-knavi-container";
const OVERLAY_ID = "overlay";
const ACTIVE_OVERLAY_ID = "active-overlay";
const HINT_CLASS = "hint";

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

  async start() {
    if (this.hints) throw Error("Illegal state");
    await waitUntil(() => Boolean(document.body));
    const body = document.body;
    this.initStyles(body);
    body.insertBefore(this.container, body.firstChild);
    this.hints = new Hints();
  }

  render(targets: HintedElement[]) {
    if (!this.hints) throw Error("Illegal state");
    const df = document.createDocumentFragment();
    for (const [target, hintElements] of generateHintElements(targets)) {
      this.hints.add(target, hintElements);
      hintElements.forEach((e) => df.appendChild(e));
    }
    this.root.appendChild(df);
  }

  private initStyles(body: HTMLElement) {
    const vpRect = vp.layout.rect();

    let overlayRect: Rect<"element-border", "element-padding">;
    // The coordinates of the <body> element may need to be used as the offset of the "container"
    // depending on the CSS position of the <body> element.
    // See https://developer.mozilla.org/en-US/docs/Web/CSS/position#absolute_positioning
    // > The absolutely positioned element is positioned relative to its nearest positioned
    // > ancestor (i.e., the nearest ancestor that is not static).
    if (getComputedStyle(body).position === "static") {
      overlayRect = new Rect({
        ...vpRect,

        // The "overlay" element overlays the viewport,
        // so "layout-viewport" is treated as an "element-border".
        type: "element-border",

        // TODO "initial-containing-block" can be treated as an "element-padding"?
        origin: "element-padding",
      });
    } else {
      const bodyCoords = new Coordinates({ ...getPaddingRects(body)[0] });
      overlayRect = new Rect({
        ...bodyCoords.reverse(),
        width: vpRect.width,
        height: vpRect.height,

        // The "overlay" element overlays the viewport,
        // so "layout-viewport" is treated as an "element-border".
        type: "element-border",
      });
    }

    applyStyle(this.container, {
      position: "absolute",
      display: "block",

      ...styleByRect(overlayRect),

      margin: "0",
      outlineWidth: "0",
      borderWidth: "0",
      padding: "0",

      overflow: "hidden",
      zIndex: Z_INDEX_OFFSET.toString(),
    });
    applyStyle(this.overlay, {
      position: "absolute",
      display: "block",

      top: "0",
      left: "0",
      width: "100%",
      height: "100%",

      margin: "0",
      outlineWidth: "0",
      borderWidth: "0",
      padding: "0",
    });
    applyStyle(this.activeOverlay, {
      position: "absolute",
      display: "none",

      top: "0",
      left: "0",
      width: "0",
      height: "0",

      margin: "0",
      outlineWidth: "0",
      borderWidth: "0",
      padding: "0",
    });
  }

  hit(changes: HintedElement[], actionDescriptions: ActionDescriptions | null) {
    if (!this.hints) throw Error("Illegal state");
    this.highlightHints(changes, actionDescriptions);
    this.moveOverlay();
    this.moveActiveOverlay(changes.find((t) => t.state === "hit") ?? null);
  }

  private highlightHints(
    changes: HintedElement[],
    actionDescriptions: ActionDescriptions | null,
  ) {
    for (const target of changes) {
      const hints = this.hints!.get(target);
      if (!hints) {
        console.warn("Illegal state: hint not found", target);
        continue;
      }

      for (const hintElement of hints.hints) {
        if (hintElement.dataset.state === "hit") {
          delete hintElement.dataset.actionDescription;
          delete hintElement.dataset.longActionDescription;
        }

        hintElement.dataset.state = target.state;
        if (target.state === "hit" && actionDescriptions) {
          hintElement.dataset.actionDescription = actionDescriptions.short;
          if (actionDescriptions.long)
            hintElement.dataset.longActionDescription = actionDescriptions.long;
        }
      }
    }
  }

  private moveOverlay() {
    const hintedRects = [
      ...flatMap(this.hints!.all(), ({ hinted }) => {
        if (hinted.state === "disabled") return [];
        return hinted.rects.map((r) => new Rect(r));
      }),
    ];
    if (hintedRects.length === 0) {
      this.overlay.style.display = "none";
      return;
    }

    const newRect = Rect.boundRects(...hintedRects);
    applyStyle(
      this.overlay,
      { display: "block" },
      styleByRect(
        // Force set origin because the offsetParent of `this.overlay` is no padding.
        // The offsetParent is `this.root`.
        new Rect({
          ...newRect,
          origin: "element-padding",
        }),
      ),
    );
  }

  private moveActiveOverlay(hitTarget: HintedElement | null) {
    if (!hitTarget) {
      this.activeOverlay.style.display = "none";
      return;
    }

    const newRect = Rect.boundRects(...hitTarget.rects);
    applyStyle(
      this.activeOverlay,
      { display: "block" },
      styleByRect(new Rect({ ...newRect, origin: "element-padding" })),
    );
  }

  remove() {
    if (!this.hints) throw Error("Illegal state");

    document.body.removeChild(this.container);
    for (const e of flatMap(this.hints.all(), (h) => h.hints))
      this.root.removeChild(e);
    this.hints = null;
  }
}

type Key<I extends ElementId> = `${I["frameId"]}:${I["index"]}`;

class Hints {
  private map = new Map<
    Key<ElementId>,
    { hinted: HintedElement; hints: HTMLElement[] }
  >();

  static key(t: ElementId): Key<ElementId> {
    return `${t.frameId}:${t.index}`;
  }

  get({
    id,
  }: HintedElement):
    | { hinted: HintedElement; hints: HTMLElement[] }
    | undefined {
    return this.map.get(Hints.key(id));
  }

  add(hinted: HintedElement, hints: HTMLElement[]) {
    this.map.set(Hints.key(hinted.id), { hinted, hints });
  }

  *all(): Generator<{ hinted: HintedElement; hints: HTMLElement[] }> {
    for (const v of this.map.values()) yield v;
  }
}

function generateHintElements(
  targets: HintedElement[],
): (readonly [HintedElement, HTMLElement[]])[] {
  const hints = targets.map((t) => [t, buildHintElements(t)] as const);
  console.debug("hints[%d]: %o", hints.length, hints);
  return hints;
}

function buildHintElements(target: HintedElement): HTMLElement[] {
  // Currently, we use only the first rect because multiple hints are too noisy.
  // const rects = target.rects;
  return target.rects.slice(0, 1).map((rect) => {
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
