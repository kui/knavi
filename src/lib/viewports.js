// @flow

import * as rects from "./rects";
import type { Rect } from "./rects";

let layoutVPOffsetsCache = null;

export const layout = {
  /// get the coordinates of the top-left of the layout viewport.
  offsets(): { y: number, x: number } {
    if (layoutVPOffsetsCache) return layoutVPOffsetsCache;
    const rootRect = document.documentElement.getBoundingClientRect();
    return layoutVPOffsetsCache = { y: - rootRect.top, x: - rootRect.left };
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

let visualVPSizesCache = null;
let prevInnerWidth;
let prevInnerHeight;

export const visual = {
  /// get the coordinates from the top-left of the visual viewport.
  offsets(): { y: number, x: number } {
    return { y: window.scrollY, x: window.scrollX };
  },
  sizes(): { height: number, width: number } {
    const innerWidth = window.innerWidth;
    const innerHeight = window.innerHeight;
    if (prevInnerWidth === innerWidth &&
        prevInnerHeight === innerHeight &&
        visualVPSizesCache) return visualVPSizesCache;
    prevInnerWidth = innerWidth;
    prevInnerHeight = innerHeight;
    const scale = getScale();
    console.debug("scale", scale);
    return visualVPSizesCache = {
      height: Math.floor(document.documentElement.clientHeight / scale),
      width:  Math.floor(document.documentElement.clientWidth / scale),
    };
  },
  rect(): Rect {
    return rects.rectByOffsetsAndSizes(this.offsets, this.sizes);
  }
};

window.addEventListener("scroll", () => {
  layoutVPOffsetsCache = null;
}, { passive: true });

window.addEventListener("resize", () => {
  layoutVPOffsetsCache = null;
  visualVPSizesCache = null;
}, { passive: true });

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

const iframeDummy = document.createElement("iframe");
Object.assign(iframeDummy.style, {
  position: "absolute",
  width: "100%",
  height: "100%",
  left: "0px",
  top: "0px",
  border: "0",
  visibility: "hidden",
});
iframeDummy.srcDoc = "<!DOCTYPE html><html><body style='margin:0px; padding:0px'></body></html>";
function getScale() {
  document.body.insertBefore(iframeDummy, document.body.firstChild);
  const documentRect = document.documentElement.getBoundingClientRect();
  Object.assign(iframeDummy.contentDocument.body.style, {
    width: `${documentRect.width}px`,
    height: `${documentRect.height}px`,
  });
  const originalOverflow = document.documentElement.style.overflow;
  document.documentElement.style.overflow = "hidden";
  const unscaledInnerWidth = iframeDummy.contentWindow.innerWidth;
  document.documentElement.style.overflow = originalOverflow;
  document.body.removeChild(iframeDummy);
  return unscaledInnerWidth / window.innerWidth;
}
