import { nextAnimationFrame } from "./animations";
import { isEditable, isScrollable } from "./elements";

interface ActionHandler {
  getDescriptions(): ActionDescriptions;
  isSupported(target: Element): boolean;
  handle(target: Element, options: MouseEventInit): void;
}

export default class ActionHandlerDelegater {
  handle(target: Element, options: MouseEventInit) {
    const h = getHandler(target);
    const d = h.getDescriptions();
    console.debug(d.long ?? d.short);
    h.handle(target, options);
  }

  getDescriptions(target: Element): ActionDescriptions {
    const h = getHandler(target);
    return h.getDescriptions();
  }
}

const handlers: ActionHandler[] = [];

function getHandler(target: Element) {
  const h = handlers.find((h) => h.isSupported(target));
  if (h == null) throw Error("Unreachable code");
  return h;
}

const CLICKABLE_SELECTORS = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "[onclick]",
  "[onmousedown]",
  "[onmouseup]",
  "[role=link]",
  "[role=button]",
].join(",");
handlers.push({
  getDescriptions() {
    return {
      short: "Click",
      long: "Click anchor, button or other clickable elements",
    };
  },
  isSupported(target) {
    return target.matches(CLICKABLE_SELECTORS);
  },
  handle(target, options) {
    simulateClick(target, options);
  },
});

handlers.push({
  getDescriptions() {
    return {
      short: "Blur",
      long: "Blur the active element",
    };
  },
  isSupported(target) {
    return target === document.activeElement;
  },
  handle(target) {
    if (target instanceof HTMLElement) {
      target.blur();
    } else {
      console.warn("Cannot blur", target);
    }
  },
});

handlers.push({
  getDescriptions() {
    return {
      short: "Focus iframe",
    };
  },
  isSupported(target) {
    return target instanceof HTMLIFrameElement;
  },
  handle(target: HTMLIFrameElement) {
    target.focus();
  },
});

handlers.push({
  getDescriptions() {
    return {
      short: "Edit",
      long: "Focus the editable element",
    };
  },
  isSupported(target) {
    return isEditable(target);
  },
  handle(target) {
    if (target instanceof HTMLElement) {
      target.focus();
    } else {
      console.warn("Cannot focus", target);
    }
  },
});

handlers.push({
  getDescriptions() {
    return {
      short: "Click",
      long: "Click the <input> element",
    };
  },
  isSupported(target) {
    return (
      target instanceof HTMLInputElement &&
      ["checkbox", "radio", "button", "image", "submit", "reset"].includes(
        target.type,
      )
    );
  },
  handle(target: HTMLInputElement, options) {
    target.focus();
    simulateClick(target, options);
  },
});

handlers.push({
  getDescriptions() {
    return {
      short: "Focus",
      long: "Focus the <input> element",
    };
  },
  isSupported(target) {
    return target instanceof HTMLInputElement;
  },
  handle(target: HTMLInputElement) {
    target.focus();
  },
});

handlers.push({
  getDescriptions() {
    return {
      short: "Focus",
      long: "Focus the <select> element",
    };
  },
  isSupported(target) {
    return target instanceof HTMLSelectElement;
  },
  handle(target: HTMLSelectElement) {
    target.focus();
  },
});

handlers.push({
  getDescriptions() {
    return {
      short: "Focus",
      long: "Focus the 'tabindex'-ed element",
    };
  },
  isSupported(target) {
    return target.hasAttribute("tabindex");
  },
  handle(target) {
    if (target instanceof HTMLElement) {
      target.focus();
    } else {
      console.warn("Cannot focus", target);
    }
  },
});

handlers.push({
  getDescriptions() {
    return {
      short: "Scroll",
      long: "Focus the scrollable element",
    };
  },
  isSupported(target) {
    return isScrollable(target, getComputedStyle(target));
  },
  handle(element) {
    if (!(element instanceof HTMLElement)) {
      console.warn("Cannot focus", element);
      return;
    }

    // Make scrollable it with your keyboard.
    if (!element.hasAttribute("tabindex")) {
      element.setAttribute("tabindex", "-1");
      element.addEventListener(
        "blur",
        () => {
          element.removeAttribute("tabindex");
        },
        { once: true },
      );
    }
    element.focus();
  },
});

// Fallback handler
handlers.push({
  getDescriptions() {
    return {
      short: "Click",
    };
  },
  isSupported() {
    return true;
  },
  handle(target, options) {
    simulateClick(target, options);
  },
});

function simulateClick(element: Element, options: MouseEventInit) {
  dispatchMouseEvent("mouseover", element, options);

  (async () => {
    for (const type of ["mousedown", "mouseup", "click"]) {
      await nextAnimationFrame();
      const b = dispatchMouseEvent(type, element, options);
      if (!b) console.debug("canceled", type);
    }
  })().catch(console.error);
}

// Return false if canceled
function dispatchMouseEvent(
  type: string,
  element: Element,
  options: MouseEventInit,
) {
  const event = new MouseEvent(type, {
    button: 0,
    bubbles: true,
    cancelable: true,
    ctrlKey: options.ctrlKey,
    shiftKey: options.shiftKey,
    altKey: options.altKey,
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    metaKey: options.metaKey || options.ctrlKey,
  });
  return element.dispatchEvent(event);
}
