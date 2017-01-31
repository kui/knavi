// @flow

import * as rects from "./rects";
import type { Rect } from "./rects";

export const layout = {
  /// get the coordinates of the top-left of the layout viewport.
  offsets(): { y: number, x: number } {
    const rootRect = document.documentElement.getBoundingClientRect();
    return { y: - rootRect.top, x: - rootRect.left };
  },
  sizes(): { height: number, width: number } {
    return {
      height: document.documentElement.clientHeight,
      width: document.documentElement.clientWidth,
    };
  },
  rect(): Rect {
    return rects.rectByOffsetsAndSizes(this.offsets, this.sizes);
  }
};

export const visual = {
  /// get the coordinates from the top-left of the visual viewport.
  offsets(): { y: number, x: number } {
    return { y: window.scrollY, x: window.scrollX };
  },
  sizes(): { height: number, width: number } {
    return {
      width:  window.innerWidth,
      height: window.innerHeight,
    };
  },
  rect(): Rect {
    return rects.rectByOffsetsAndSizes(this.offsets, this.sizes);
  }
};

export function getClientRectsFromVisualVP(element: HTMLElement): Rect[] {
  const layoutVpOffsets = layout.offsets();
  const visualVpOffsets = visual.offsets();
  const delta = {
    y: layoutVpOffsets.y - visualVpOffsets.y,
    x: layoutVpOffsets.x - visualVpOffsets.x,
  };
  return Array.from(element.getClientRects())
    .map((r) => rects.move(r, delta));
}

export function getBoundingClientRectFromRoot(element: HTMLElement): Rect {
  const layoutVpOffsets = layout.offsets();
  const rectFromLayoutVp = element.getBoundingClientRect();
  return rects.move(rectFromLayoutVp, layoutVpOffsets);
}
