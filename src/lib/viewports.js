import * as rects from "./rects";

export const layout = {
  /// get the coordinates of the top-left of the layout viewport.
  offsets() {
    return { y: scrollY, x: scrollX };
  },
  sizes() {
    const documentElement = document.documentElement;
    if (!documentElement) return { height: 0, width: 0 };
    return {
      height: documentElement.clientHeight,
      width: documentElement.clientWidth
    };
  },
  rect() {
    return rects.rectByOffsetsAndSizes(this.offsets(), this.sizes());
  }
};

export const visual = {
  /// get the coordinates from the top-left of the visual viewport.
  offsets() {
    return { y: visualViewport.pageTop, x: visualViewport.pageLeft };
  },
  sizes() {
    return { height: visualViewport.height, width: visualViewport.width };
  },
  rect() {
    return rects.rectByOffsetsAndSizes(this.offsets(), this.sizes());
  }
};

export function getBoundingClientRectFromRoot(element) {
  const layoutVpOffsets = layout.offsets();
  const rectFromLayoutVp = element.getBoundingClientRect();
  return rects.move(rectFromLayoutVp, layoutVpOffsets);
}
