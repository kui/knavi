import { map } from "../lib/iters";
import { Coordinates, Rect } from "./rects";

export const Z_INDEX_OFFSET = 2147483647;

export function isScrollable(
  element: Element,
  style: StylePropertyMapReadOnly,
) {
  if (
    element.scrollHeight - element.clientHeight > 10 &&
    ["auto", "scroll"].includes(style.get("overflow-y")!.toString())
  )
    return true;
  if (
    element.scrollWidth - element.clientWidth > 10 &&
    ["auto", "scroll"].includes(style.get("overflow-x")!.toString())
  )
    return true;
  return false;
}

const NON_TEXT_INPUT_TYPES = new Set([
  "hidden",
  "checkbox",
  "radio",
  "button",
  "submit",
  "reset",
  "image",
  "file",
  "color",
  "range",
]);

export function isEditable(element: EventTarget) {
  if (element instanceof HTMLInputElement)
    return (
      !element.disabled &&
      !element.readOnly &&
      !NON_TEXT_INPUT_TYPES.has(element.type)
    );
  if (element instanceof HTMLTextAreaElement)
    return !element.disabled && !element.readOnly;
  if ("selectionStart" in element && element.selectionStart != null) {
    // WHY: custom elements exposing the selection API
    const el = element as unknown as {
      disabled?: boolean;
      readOnly?: boolean;
      getAttribute?: (name: string) => string | null;
    };
    if (el.disabled || el.readOnly) return false;
    if (
      el.getAttribute?.("aria-disabled") === "true" ||
      el.getAttribute?.("aria-readonly") === "true"
    )
      return false;
    return true;
  }
  return "isContentEditable" in element && Boolean(element.isContentEditable);
}

export function* traverseParent(
  element: Element,
  includeSelf?: boolean,
): Generator<Element> {
  let p = includeSelf ? element : element.parentElement;
  while (p) {
    yield p;
    p = p.parentElement;
  }
}

export function* traverseFirstChild(
  element: Element,
  includeSelf?: boolean,
): Generator<Element> {
  let c = includeSelf ? [element] : element.children;
  while (c.length >= 1) {
    yield c[0];
    c = c[0].children;
  }
}

export function applyStyle<E extends HTMLElement>(
  element: E,
  ...styles: Partial<CSSStyleDeclaration>[]
): E {
  Object.assign(element.style, ...styles);
  return element;
}

export function applyRect(
  element: HTMLElement,
  // INVARIANT: Origin element(-padding) should be offsetParent.
  rect: Rect<"element-border", "element-padding">,
): HTMLElement {
  applyStyle(element, styleByRect(rect));
  return element;
}

export function styleByRect(
  // INVARIANT: Origin element(-padding) should be offsetParent.
  rect: Rect<"element-border", "element-padding">,
): Pick<CSSStyleDeclaration, "top" | "left" | "width" | "height"> {
  return {
    top: `${Math.round(rect.y)}px`,
    left: `${Math.round(rect.x)}px`,
    width: `${Math.round(rect.width)}px`,
    height: `${Math.round(rect.height)}px`,
  };
}

export function getClientCoordinates(
  element: Element,
): Coordinates<"element-border", "layout-viewport"> {
  return new Coordinates({
    type: "element-border",
    origin: "layout-viewport",
    x: element.clientLeft,
    y: element.clientTop,
  });
}

export function getBoundingClientRect(
  element: Element,
): Rect<"element-border", "layout-viewport"> {
  const { x, y, width, height } = element.getBoundingClientRect();
  return new Rect({
    type: "element-border",
    origin: "layout-viewport",
    x,
    y,
    width,
    height,
  });
}

export function getBoundingClientRectInRootFrame(
  element: Element,
): Rect<"element-border", "root-viewport"> {
  if (window !== window.parent) throw new Error("Not in root frame");
  return new Rect({
    ...getBoundingClientRect(element),
    origin: "root-viewport",
  });
}

export function getOffsetsByBorder(
  element: Element,
): Coordinates<"element-padding", "element-border"> {
  return new Coordinates({
    type: "element-padding",
    origin: "element-border",
    x: element.clientLeft,
    y: element.clientTop,
  });
}

export function getClientRects(
  element: Element,
): Rect<"element-border", "layout-viewport">[] {
  return [
    ...map(
      element.getClientRects(),
      ({ x, y, width, height }: DOMRectReadOnly) =>
        new Rect({
          type: "element-border",
          origin: "layout-viewport",
          x,
          y,
          width,
          height,
        }),
    ),
  ];
}

export function getPaddingRectFromBorderArea(
  element: Element,
): Rect<"element-padding", "element-border"> {
  return new Rect({
    type: "element-padding",
    origin: "element-border",
    x: element.clientLeft,
    y: element.clientTop,
    width: element.clientWidth,
    height: element.clientHeight,
  });
}

export function getPaddingRects(
  element: Element,
  clientRects: Rect<"element-border", "layout-viewport">[] = getClientRects(
    element,
  ),
): Rect<"element-padding", "layout-viewport">[] {
  const paddingRect = getPaddingRectFromBorderArea(element);
  return clientRects.map((r) => paddingRect.offsets(r.reverse()));
}

/* WHY: See this playground for the padding/content-rect edge cases this
 * function accounts for: https://developer.mozilla.org/ja/play?id=DHsQtf%2Bkx53WFGR2KG1novl1TT5ML%2F0VHABLcyh94WFJ5QGkScrEmjxke24Zi62Kjv%2FHXvZWdWHqC7yP */
export function getContentRects(
  element: HTMLElement,
  rects: Rect<"element-border", "layout-viewport">[] = getClientRects(element),
  style: StylePropertyMapReadOnly = element.computedStyleMap(),
): Rect<"element-content", "layout-viewport">[] {
  if (rects.length === 0) return [];

  const paddingCss = getCSSValuesForEachEdges(style, (s) => `padding-${s}`);
  /* WHY: "em"-unit padding isn't handled below; it's rare for an iframe's
   * padding to be specified in "em" units. */
  if (everyZeroOrPxUnit(paddingCss)) {
    const resizePx = toResizePx(paddingCss);
    return getPaddingRects(element, rects).map(
      (r) => new Rect({ ...r.resize(resizePx), type: "element-content" }),
    );
  }

  console.warn(
    "Cannot get content area with padding in this unit: element=",
    element,
    "paddingCss=",
    paddingCss,
  );

  switch (style.get("box-sizing")?.toString()) {
    case "content-box":
      break;
    case "border-box":
      break;
    default:
      throw Error(`Unknown box-sizing: ${style.get("box-sizing")?.toString()}`);
  }

  /* WHY: Computing the exact content-box/border-box rect would require
   * toggling padding to 0, remeasuring, then restoring the element's style;
   * approximate with the padding rect instead. */
  return getPaddingRects(element, rects).map(
    (rect) => new Rect({ ...rect, type: "element-content" }),
  );
}

const EDGES = ["top", "left", "bottom", "right"] as const;

function everyZeroOrPxUnit(
  edges: Record<(typeof EDGES)[number], CSSStyleValue>,
): edges is Record<(typeof EDGES)[number], CSSUnitValue> {
  return Object.values(edges).every(
    (v) => v instanceof CSSUnitValue && (v.value === 0 || v.unit === "px"),
  );
}

function getCSSValuesForEachEdges(
  style: StylePropertyMapReadOnly,
  propertyName: (side: (typeof EDGES)[number]) => string,
): Record<(typeof EDGES)[number], CSSStyleValue> {
  return EDGES.reduce(
    (acc, edge) => {
      const value = style.get(propertyName(edge));
      acc[edge] = value ?? new CSSUnitValue(0, "px");
      return acc;
    },
    {} as Record<(typeof EDGES)[number], CSSStyleValue>,
  );
}

function toResizePx(
  c: Record<(typeof EDGES)[number], CSSUnitValue>,
): Record<(typeof EDGES)[number], number> {
  return EDGES.reduce(
    (acc, edge) => {
      acc[edge] = -c[edge].value;
      return acc;
    },
    {} as Record<(typeof EDGES)[number], number>,
  );
}

export function* listAll(d: ParentNode = document): Generator<Element> {
  if (d instanceof Document) d = d.body;
  for (const e of d.querySelectorAll("*")) {
    yield e;
    if (e.shadowRoot) yield* listAll(e.shadowRoot);
  }
}

/**
 * Yields iframes that live inside open shadow roots reachable from `d`.
 * Skips light-DOM iframes — callers should combine this with
 * `document.getElementsByTagName("iframe")` for the cheap light-DOM pass.
 * Walking every element is unavoidable here: there is no DOM API to
 * enumerate shadow roots directly.
 */
export function* listIframesInShadowRoots(
  d: ParentNode = document,
): Generator<HTMLIFrameElement> {
  for (const host of d.querySelectorAll("*")) {
    const root = host.shadowRoot;
    if (!root) continue;
    for (const iframe of root.querySelectorAll("iframe")) yield iframe;
    yield* listIframesInShadowRoots(root);
  }
}
