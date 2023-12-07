import { map } from "./iters";
import { Coordinates, Rect } from "./rects";

export const Z_INDEX_OFFSET = 2147483640;

export function isScrollable(
  element: Element,
  style: StylePropertyMapReadOnly,
) {
  if (
    element.scrollHeight - element.clientHeight > 10 &&
    ["auto", "scroll"].includes(style.get("overflow-y")!.toString()!)
  )
    return true;
  if (
    element.scrollWidth - element.clientWidth > 10 &&
    ["auto", "scroll"].includes(style.get("overflow-x")!.toString()!)
  )
    return true;
  return false;
}

export function isEditable(element: EventTarget) {
  if ("selectionStart" in element && element.selectionStart != null)
    return true;

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
  // Origin element(-padding) should be offsetParent.
  rect: Rect<"element-border", "element-padding">,
): HTMLElement {
  applyStyle(element, styleByRect(rect));
  return element;
}

export function styleByRect(
  // Origin element(-padding) should be offsetParent.
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

// https://developer.mozilla.org/ja/play?id=DHsQtf%2Bkx53WFGR2KG1novl1TT5ML%2F0VHABLcyh94WFJ5QGkScrEmjxke24Zi62Kjv%2FHXvZWdWHqC7yP
export function getContentRects(
  element: HTMLElement,
  rects: Rect<"element-border", "layout-viewport">[] = getClientRects(element),
  style: StylePropertyMapReadOnly = element.computedStyleMap(),
): Rect<"element-content", "layout-viewport">[] {
  if (rects.length === 0) return [];

  const paddingCss = getCSSValuesForEachEdges(style, (s) => `padding-${s}`);
  // TODO We can compute the px of paddings with "em" unit.
  // But it seems that there are few cases where the padding of an iframe is specified in "em" units.
  if (everyZeroOrPxUnit(paddingCss)) {
    const paddingPx = toPxEdges(paddingCss);
    return getPaddingRects(element, rects).map(
      (r) => new Rect({ ...r.resize(paddingPx), type: "element-content" }),
    );
  }

  switch (style.get("box-sizing")?.toString()) {
    case "content-box":
      // TODO implement
      // We can get content area with dirty hack.
      // 1. Get padding area box.
      // 2. Store current element's style.
      // 3. Set padding to 0 and transition to none.
      // 4. Get padding area box again.
      // 5. Restore style.
      // 6. Calculate content area from the two padding area.
      break;
    case "border-box":
      // TODO implement
      // We can get content area with more dirty hack than above
      // by changing box-sizing into content-box.
      break;
    default:
      throw Error(`Unknown box-sizing: ${style.get("box-sizing")?.toString()}`);
  }

  // Workaround to avoid above dirty hacks.
  return getPaddingRects(element, rects).map(
    (rect) => new Rect({ ...rect, type: "element-content" }),
  );
}

const EDGES = ["top", "left", "bottom", "right"] as const;

function everyZeroOrPxUnit(edges: {
  [side in (typeof EDGES)[number]]: CSSStyleValue;
}): edges is { [side in (typeof EDGES)[number]]: CSSUnitValue } {
  return Object.values(edges).every(
    (v) => v instanceof CSSUnitValue && (v.value === 0 || v.unit === "px"),
  );
}

function getCSSValuesForEachEdges(
  style: StylePropertyMapReadOnly,
  propertyName: (side: (typeof EDGES)[number]) => string,
): { [side in (typeof EDGES)[number]]: CSSStyleValue } {
  return EDGES.reduce(
    (acc, edge) => {
      const value = style.get(propertyName(edge));
      acc[edge] = value ?? new CSSUnitValue(0, "px");
      return acc;
    },
    {} as { [side in (typeof EDGES)[number]]: CSSStyleValue },
  );
}

function toPxEdges(c: { [side in (typeof EDGES)[number]]: CSSUnitValue }): {
  [side in (typeof EDGES)[number]]: number;
} {
  return EDGES.reduce(
    (acc, edge) => {
      acc[edge] = c[edge].value;
      return acc;
    },
    {} as { [side in (typeof EDGES)[number]]: number },
  );
}

export function* listAll(
  d: Document | ShadowRoot = document,
): Generator<Element> {
  for (const e of d.querySelectorAll("*")) {
    yield e;
    if (e.shadowRoot) yield* listAll(e.shadowRoot);
  }
}
