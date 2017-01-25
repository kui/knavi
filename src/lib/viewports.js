// @flow

interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

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
  }
};

export function getBoundingClientRectFromRoot(element: HTMLElement): Rect {
  const layoutVpOffsets = layout.offsets();
  const rectFromLayoutVp = element.getBoundingClientRect();
  return {
    top:    rectFromLayoutVp.top    + layoutVpOffsets.y,
    bottom: rectFromLayoutVp.bottom + layoutVpOffsets.y,
    left:   rectFromLayoutVp.left   + layoutVpOffsets.x,
    right:  rectFromLayoutVp.right  + layoutVpOffsets.x,
    height: rectFromLayoutVp.height,
    width:  rectFromLayoutVp.width,
  };
}
