import * as utils from "./utils";

const handlers = [];

export default class ActionHandlerDelegater {
  handle(target, options) {
    this.getHandler(target).handle(target, options);
  }

  getDescriptions(target) {
    const h = this.getHandler(target);
    return { short: h.shortDescription, long: h.longDescription };
  }

  getHandler(target) {
    const h = handlers.find(h => h.isSupported(target));
    if (h == null) throw Error("Unreachable code");
    return h;
  }
}

const CLICKABLE_SELECTORS = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "[onclick]",
  "[onmousedown]",
  "[onmouseup]",
  "[role=link]",
  "[role=button]"
].join(",");
handlers.push({
  shortDescription: "Click",
  longDescription: "Click anchor, button or other clickable elements",
  isSupported(target) {
    return target.matches(CLICKABLE_SELECTORS);
  },
  handle(target, options) {
    simulateClick(target, options);
    console.debug("click", target);
  }
});

handlers.push({
  shortDescription: "Blur",
  longDescription: "Blur the focused element",
  isSupported(target) {
    return target === document.activeElement;
  },
  handle(target) {
    target.blur();
    console.debug(this.longDescription, target);
  }
});

handlers.push({
  shortDescription: "Focus iframe",
  isSupported(target) {
    return target.tagName === "IFRAME";
  },
  handle(target) {
    target.focus();
    console.debug("Focus iframe", target);
  }
});

handlers.push({
  shortDescription: "Edit",
  longDescription: "Focus the editable element",
  isSupported(target) {
    return utils.isEditable(target);
  },
  handle(target) {
    target.focus();
    console.debug(this.longDescription, target);
  }
});

handlers.push({
  shortDescription: "Click",
  longDescription: "Click the <input> element",
  isSupported(target) {
    return (
      target.tagName === "INPUT" &&
      ["checkbox", "radio", "button", "image", "submit", "reset"].includes(
        target.type
      )
    );
  },
  handle(target, options) {
    target.focus();
    simulateClick(target, options);
    console.debug(this.longDescription, target);
  }
});

handlers.push({
  shortDescription: "Focus",
  longDescription: "Focus the <input> element",
  isSupported(target) {
    return target.tagName === "INPUT";
  },
  handle(target) {
    target.focus();
    console.debug(this.longDescription, target);
  }
});

handlers.push({
  shortDescription: "Focus",
  longDescription: "Focus the <select> element",
  isSupported(target) {
    return target.tagName === "SELECT";
  },
  handle(target) {
    target.focus();
    console.debug(this.longDescription, target);
  }
});

handlers.push({
  shortDescription: "Focus",
  longDescription: "Focus the 'tabindex'-ed element",
  isSupported(target) {
    return target.hasAttribute("tabindex");
  },
  handle(target) {
    target.focus();
    console.debug(this.longDescription, target);
  }
});

handlers.push({
  shortDescription: "Scroll",
  longDescription: "Focus the scrollable element",
  isSupported(target) {
    return utils.isScrollable(target, window.getComputedStyle(target));
  },
  handle(element) {
    // Make scrollable from your keyboard
    if (!element.hasAttribute("tabindex")) {
      element.setAttribute("tabindex", "-1");
      element.addEventListener("blur", function removeTabIndex() {
        element.removeEventListener("blur", removeTabIndex);
        element.removeAttribute("tabindex");
      });
    }
    element.focus();
    console.debug(this.longDescription, element);
  }
});

handlers.push({
  shortDescription: "Click",
  isSupported() {
    return true;
  },
  handle(target, options) {
    simulateClick(target, options);
    console.debug("click", target);
  }
});

async function simulateClick(element, options) {
  dispatchMouseEvent("mouseover", element, options);

  for (const type of ["mousedown", "mouseup", "click"]) {
    await utils.nextAnimationFrame();
    const b = dispatchMouseEvent(type, element, options);
    if (!b) console.debug("canceled", type);
  }
}

/// Return false if canceled
function dispatchMouseEvent(type, element, options) {
  const event = new MouseEvent(type, {
    button: 0,
    bubbles: true,
    cancelable: true,
    ctrlKey: options.ctrlKey,
    shiftKey: options.shiftKey,
    altKey: options.altKey,
    metaKey: options.metaKey || options.ctrlKey
  });
  return element.dispatchEvent(event);
}
