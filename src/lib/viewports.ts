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
