import { Coordinates, Rect } from "./rects";

export const layout = {
  offsets(): Coordinates<"layout-viewport", "initial-containing-block"> {
    return new Coordinates({
      type: "layout-viewport",
      origin: "initial-containing-block",
      y: scrollY,
      x: scrollX,
    });
  },
  sizes(): Sizes {
    const documentElement = document.documentElement;
    return {
      height: documentElement.clientHeight,
      width: documentElement.clientWidth,
    };
  },
  rect(): Rect<"layout-viewport", "initial-containing-block"> {
    return new Rect({ ...this.offsets(), ...this.sizes() });
  },
};

export const visual = {
  offsets(): Coordinates<"visual-viewport", "initial-containing-block"> {
    if (!visualViewport) throw new Error("visualViewport is not supported");
    return new Coordinates({
      type: "visual-viewport",
      origin: "initial-containing-block",
      y: visualViewport.pageTop,
      x: visualViewport.pageLeft,
    });
  },
  offsetsFromLayoutViewport(): Coordinates<
    "visual-viewport",
    "layout-viewport"
  > {
    if (!visualViewport) throw new Error("visualViewport is not supported");
    return new Coordinates({
      type: "visual-viewport",
      origin: "layout-viewport",
      y: visualViewport.offsetTop,
      x: visualViewport.offsetLeft,
    });
  },
  sizes(): Sizes {
    if (!visualViewport) throw new Error("visualViewport is not supported");
    return { height: visualViewport.height, width: visualViewport.width };
  },
  rect(): Rect<"visual-viewport", "initial-containing-block"> {
    return new Rect({ ...this.offsets(), ...this.sizes() });
  },
};
