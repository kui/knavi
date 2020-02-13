import * as rects from "./rects";


let layoutVPOffsetsCache = null;

export const layout = {
  /// get the coordinates of the top-left of the layout viewport.
  offsets() {
    if (layoutVPOffsetsCache) return layoutVPOffsetsCache;
    const documentElement = document.documentElement;
    if (!documentElement) return { y: 0, x: 0 };
    const rootRect = documentElement.getBoundingClientRect();
    return layoutVPOffsetsCache = { y: -rootRect.top, x: -rootRect.left };
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

let visualVPSizesCache = null;
let prevInnerWidth;
let prevInnerHeight;

export const visual = {
  /// get the coordinates from the top-left of the visual viewport.
  offsets() {
    return { y: window.scrollY, x: window.scrollX };
  },
  sizes() {
    const innerWidth = window.innerWidth;
    const innerHeight = window.innerHeight;
    if (prevInnerWidth === innerWidth && prevInnerHeight === innerHeight && visualVPSizesCache) return visualVPSizesCache;
    prevInnerWidth = innerWidth;
    prevInnerHeight = innerHeight;
    const documentElement = document.documentElement;
    if (!documentElement) return { height: 0, width: 0 };
    const body = document.body;
    if (!body) return { height: 0, width: 0 };
    const scale = getScale(documentElement, body);
    console.debug("scale", scale);
    return visualVPSizesCache = {
      height: Math.floor(documentElement.clientHeight / scale),
      width: Math.floor(documentElement.clientWidth / scale)
    };
  },
  rect() {
    return rects.rectByOffsetsAndSizes(this.offsets(), this.sizes());
  }
};

window.addEventListener("scroll", () => {
  layoutVPOffsetsCache = null;
}, { passive: true });

window.addEventListener("resize", () => {
  layoutVPOffsetsCache = null;
  visualVPSizesCache = null;
}, { passive: true });

export function getBoundingClientRectFromRoot(element) {
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
  visibility: "hidden"
});
iframeDummy.srcDoc = "<!DOCTYPE html><html><body style='margin:0px; padding:0px'></body></html>";
function getScale(documentElement, body) {
  body.insertBefore(iframeDummy, body.firstChild);
  const documentRect = documentElement.getBoundingClientRect();
  if (!iframeDummy.contentDocument || !iframeDummy.contentDocument.body) return 1;
  Object.assign(iframeDummy.contentDocument.body.style, {
    width: `${documentRect.width}px`,
    height: `${documentRect.height}px`
  });
  const originalOverflow = documentElement.style.overflow;
  documentElement.style.overflow = "hidden";
  const unscaledInnerWidth = iframeDummy.contentWindow.innerWidth;
  documentElement.style.overflow = originalOverflow;
  body.removeChild(iframeDummy);
  return unscaledInnerWidth / window.innerWidth;
}