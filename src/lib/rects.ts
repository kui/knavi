import { map } from "./iters";

export function rectByOffsetsAndSizes(
  offsets: Coordinates,
  sizes: Sizes,
): Rect {
  return {
    ...offsets,
    ...sizes,
  };
}

export function move(rect: Rect, offsets: Coordinates): Rect {
  return {
    ...rect,
    x: rect.x + offsets.x,
    y: rect.y + offsets.y,
  };
}

export function offsets(rect: Rect, offsets: Coordinates): Rect {
  return {
    ...rect,
    x: rect.x - offsets.x,
    y: rect.y - offsets.y,
  };
}

export function intersection(...rects: Rect[]): Rect | null {
  const domRects = rects.map((r) => DOMRectReadOnly.fromRect(r));
  const left = Math.max(...map(domRects, (r) => r.left));
  const right = Math.min(...map(domRects, (r) => r.right));
  const top = Math.max(...map(domRects, (r) => r.top));
  const bottom = Math.min(...map(domRects, (r) => r.bottom));

  if (left >= right || top >= bottom) return null;
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

export function getBoundingRect(rects: Rect[]): Rect {
  const domRects = rects.map((r) => DOMRectReadOnly.fromRect(r));
  const left = Math.min(...map(domRects, (r) => r.left));
  const right = Math.max(...map(domRects, (r) => r.right));
  const top = Math.min(...map(domRects, (r) => r.top));
  const bottom = Math.max(...map(domRects, (r) => r.bottom));

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

export function excludeBorders(
  rect: Rect,
  borders: { top: number; right: number; bottom: number; left: number },
): Rect {
  return {
    x: rect.x + borders.left,
    y: rect.y + borders.top,
    width: rect.width - borders.left - borders.right,
    height: rect.height - borders.top - borders.bottom,
  };
}

export function addPadding(rect: Rect, padding: number): Rect {
  return {
    x: rect.x - padding,
    y: rect.y - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };
}

export function empty(offset: Coordinates): Rect {
  return {
    ...offset,
    width: 0,
    height: 0,
  };
}
