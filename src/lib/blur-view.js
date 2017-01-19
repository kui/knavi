// @flow

import Blurer from "./blurer";

const Z_INDEX_OFFSET = 2147483640;

declare class Object {
  static assign: Object$Assign;
}

export default class BlurView {
  constructor(blurer: Blurer) {
    const overlay = document.createElement("div");
    Object.assign(overlay.style, {
      position: "absolute",
      display: "block",
      zIndex: Z_INDEX_OFFSET.toString(),
    });

    function removeOverlay() {
      if (document.body.contains(overlay)) {
        document.body.removeChild(overlay);
      }
    }

    function animate() {
      // $FlowFixMe
      const animation = overlay.animate([
        { boxShadow: "0 0   0    0 rgba(128,128,128,0.15), 0 0   0    0 rgba(0,0,128,0.1)" },
        { boxShadow: "0 0 3px 72px rgba(128,128,128,   0), 0 0 3px 80px rgba(0,0,128,  0)" },
      ], {
        duration: 200,
      });
      animation.addEventListener("finish", removeOverlay);
    }

    blurer.onBlured.listen((element) => {
      removeOverlay();

      const rect = element.getBoundingClientRect();
      Object.assign(overlay.style, {
        top:  `${window.scrollY + rect.top}px`,
        left: `${window.scrollX + rect.left}px`,
        height: `${rect.height}px`,
        width:  `${rect.width}px`,
      });
      document.body.insertBefore(overlay, document.body.firstChild);

      animate();
    });
  }
}
