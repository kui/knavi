import * as rects from "./rects";

export const layout = {
  // get the coordinates of the top-left of the layout viewport from the top-left of the document.
  offsets(): Coordinates {
    return { y: scrollY, x: scrollX };
  },
  sizes(): Sizes {
    const documentElement = document.documentElement;
    if (!documentElement) return { height: 0, width: 0 };
    return {
      height: documentElement.clientHeight,
      width: documentElement.clientWidth,
    };
  },
  rect(): Rect {
    return rects.rectByOffsetsAndSizes(this.offsets(), this.sizes());
  },
};

export const visual = {
  // get the coordinates of the top-left of the visual viewport from the top-left of the document.
  offsets(): Coordinates {
    if (!visualViewport) throw new Error("visualViewport is not supported");
    return { x: visualViewport.pageLeft, y: visualViewport.pageTop };
  },
  offsetsFromLayoutVp(): Coordinates {
    if (!visualViewport) throw new Error("visualViewport is not supported");
    return { x: visualViewport.offsetLeft, y: visualViewport.offsetTop };
  },
  sizes(): Sizes {
    if (!visualViewport) throw new Error("visualViewport is not supported");
    return { height: visualViewport.height, width: visualViewport.width };
  },
  rect(): Rect {
    return rects.rectByOffsetsAndSizes(this.offsets(), this.sizes());
  },
};

export function getBoundingClientRectFromRoot(element: Element): Rect {
  const layoutVpOffsets = layout.offsets();
  const rectFromLayoutVp = element.getBoundingClientRect();
  return rects.move(rectFromLayoutVp, layoutVpOffsets);
}
