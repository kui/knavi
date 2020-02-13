export function rectByOffsetsAndSizes(offsets, sizes) {
  return {
    top: offsets.y,
    bottom: offsets.y + sizes.height,
    left: offsets.x,
    right: offsets.x + sizes.width,
    height: sizes.height,
    width: sizes.width
  };
}

export function rectByTBLR(top, bottom, left, right) {
  if (top > bottom || left > right) {
    return null;
  }
  return rect(top, bottom, left, right);
}

export function rectByPoints(...points) {
  const top = Math.min(...points.map(p => p.y));
  const bottom = Math.max(...points.map(p => p.y));
  const left = Math.min(...points.map(p => p.x));
  const right = Math.max(...points.map(p => p.x));
  return rect(top, bottom, left, right);
}

function rect(top, bottom, left, right) {
  return {
    top,
    bottom,
    left,
    right,
    height: bottom - top,
    width: right - left
  };
}

export function move(r, delta) {
  return {
    top: r.top + delta.y,
    bottom: r.bottom + delta.y,
    left: r.left + delta.x,
    right: r.right + delta.x,
    height: r.height,
    width: r.width
  };
}

export function offsets(r, offsets) {
  return {
    top: r.top - offsets.y,
    bottom: r.bottom - offsets.y,
    left: r.left - offsets.x,
    right: r.right - offsets.x,
    height: r.height,
    width: r.width
  };
}

export function intersection(...rects) {
  const top = Math.max(...rects.map(r => r.top));
  const bottom = Math.min(...rects.map(r => r.bottom));
  const left = Math.max(...rects.map(r => r.left));
  const right = Math.min(...rects.map(r => r.right));
  return rectByTBLR(top, bottom, left, right);
}

export function excludeBorders(rect, borderWidth) {
  return rectByPoints(
    {
      y: rect.top + borderWidth.top,
      x: rect.left + borderWidth.left
    },
    {
      y: rect.bottom - borderWidth.bottom,
      x: rect.right - borderWidth.right
    }
  );
}

export function getBoundingRect(rects) {
  if (rects.length === 1) return rects[0];

  const top = Math.min(...rects.map(r => r.top));
  const bottom = Math.max(...rects.map(r => r.bottom));
  const left = Math.min(...rects.map(r => r.left));
  const right = Math.max(...rects.map(r => r.right));
  return {
    top,
    bottom,
    left,
    right,
    height: bottom - top,
    width: right - left
  };
}
