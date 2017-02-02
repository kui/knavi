// @flow

export interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

export interface Point {
  y: number, x: number
}

export interface Sizes {
  height: number, width: number
}

export function rectByOffsetsAndSizes(offsets: Point, sizes: Sizes): Rect {
  return {
    top: offsets.y, bottom: offsets.y + sizes.height,
    left: offsets.x, right: offsets.x + sizes.width,
    height: sizes.height, width: sizes.width,
  };
}

export function rectByTBLR(top: number, bottom: number, left: number, right: number): ?Rect {
  if (top > bottom || left > right) {
    return null;
  }
  return rect(top, bottom, left, right);
}

export function rectByPoints(...points: Point[]): Rect {
  const top =    Math.min(...points.map((p) => p.y));
  const bottom = Math.max(...points.map((p) => p.y));
  const left =   Math.min(...points.map((p) => p.x));
  const right =  Math.max(...points.map((p) => p.x));
  return rect(top, bottom, left, right);
}

function rect(top, bottom, left, right) {
  return {
    top, bottom, left, right,
    height: bottom - top,
    width: right - left,
  };
}

export function move(r: Rect, delta: Point) {
  return {
    top: r.top + delta.y,
    bottom: r.bottom + delta.y,
    left: r.left + delta.x,
    right: r.right + delta.x,
    height: r.height,
    width: r.width,
  };
}

export function offsets(r: Rect, offsets: Point) {
  return {
    top: r.top - offsets.y,
    bottom: r.bottom - offsets.y,
    left: r.left - offsets.x,
    right: r.right - offsets.x,
    height: r.height,
    width: r.width,
  };
}

export function intersection(...rects: Rect[]): ?Rect {
  const top = Math.max(...rects.map((r) => r.top));
  const bottom = Math.min(...rects.map((r) => r.bottom));
  const left = Math.max(...rects.map((r) => r.left));
  const right = Math.min(...rects.map((r) => r.right));
  return rectByTBLR(top, bottom, left, right);
}

export type BorderWidth = {
  [n: "left" | "right" | "top" | "bottom"]: number,
  left: number,
  right: number,
  top: number,
  bottom: number,
};

export function excludeBorders(rect: Rect, borderWidth: BorderWidth) {
  return rectByPoints({
    y: rect.top + borderWidth.top,
    x: rect.left + borderWidth.left,
  }, {
    y: rect.bottom - borderWidth.bottom,
    x: rect.right - borderWidth.right,
  });
}
