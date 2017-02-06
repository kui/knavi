// @flow

import * as utils from "./utils";

export interface ActionOptions {
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

declare interface Handler {
  shortDescription: string;
  longDescription?: string;
  isSupported(element: HTMLElement): boolean;
  handle(element: HTMLElement, options: ActionOptions): void;
}

const handlers: Handler[] = [];

export default class ActionHandlerDelegater {
  handle(target: HTMLElement, options: ActionOptions) {
    this.getHandler(target).handle(target, options);
  }

  getDescriptions(target: HTMLElement): { short: string, long: ?string } {
    const h = this.getHandler(target);
    return { short: h.shortDescription, long: h.longDescription };
  }

  getHandler(target: HTMLElement): Handler {
    const h = handlers.find((h) => h.isSupported(target));
    if (h == null) throw Error("Unreachable code");
    return h;
  }
}

handlers.push({
  shortDescription: "Blur",
  longDescription: "Blur the focused element",
  isSupported(target: HTMLElement) {
    return target === document.activeElement;
  },
  handle() {
    const activeElement = document.activeElement;
    if (!activeElement) return;
    activeElement.blur();
    console.debug(this.longDescription, activeElement);
  }
});

handlers.push({
  shortDescription: "Focus iframe",
  isSupported(target: HTMLElement) {
    return target.tagName === "IFRAME";
  },
  handle(target: HTMLElement) {
    target.focus();
    console.debug("Focus iframe", target);
  }
});

handlers.push({
  shortDescription: "Edit",
  longDescription: "Focus the editable element",
  isSupported(target: HTMLElement) {
    return utils.isEditable(target);
  },
  handle(target: HTMLElement) {
    target.focus();
    console.debug(this.longDescription, target);
  }
});

handlers.push({
  shortDescription: "Click",
  longDescription: "Click the <input> element",
  isSupported(target: HTMLElement) {
    return target.tagName === "INPUT" &&
      ["checkbox", "radio", "button", "image", "submit", "reset"].includes((target: any).type);
  },
  handle(target: HTMLElement, options: ActionOptions) {
    target.focus();
    simulateClick(target, options);
    console.debug(this.longDescription, target);
  }
});

handlers.push({
  shortDescription: "Focus",
  longDescription: "Focus the <input> element",
  isSupported(target: HTMLElement) {
    return target.tagName === "INPUT";
  },
  handle(target: HTMLElement) {
    target.focus();
    console.debug(this.longDescription, target);
  }
});

handlers.push({
  shortDescription: "Focus",
  longDescription: "Focus the <select> element",
  isSupported(target: HTMLElement) {
    return target.tagName === "SELECT";
  },
  handle(target: HTMLElement) {
    target.focus();
    console.debug(this.longDescription, target);
  }
});

handlers.push({
  shortDescription: "Focus",
  longDescription: "Focus the 'tabindex'-ed element",
  isSupported(target: HTMLElement) {
    return target.hasAttribute("tabindex");
  },
  handle(target: HTMLElement) {
    target.focus();
    console.debug(this.longDescription, target);
  }
});

handlers.push({
  shortDescription: "Scroll",
  longDescription: "Focus the scrollable element",
  isSupported(target: HTMLElement) {
    return utils.isScrollable(target, window.getComputedStyle(target));
  },
  handle(element: HTMLElement) {
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
  isSupported() { return true; },
  handle(target: HTMLElement, options: ActionOptions) {
    simulateClick(target, options);
    console.debug("click", target);
  }
});

async function simulateClick(element: HTMLElement, options: ActionOptions) {
  dispatchMouseEvent("mouseover", element, options);

  for (const type of ["mousedown", "mouseup", "click"]) {
    await utils.nextAnimationFrame();
    const b = dispatchMouseEvent(type, element, options);
    if (!b) console.debug("canceled", type);
  }
}

declare class MouseEvent extends UIEvent {
  constructor(type: MouseEventTypes, mouseEventInit?: MouseEventInit): void;
}

declare interface MouseEventInit {
  screenX?: number;
  screenY?: number;
  clientX?: number;
  clientY?: number;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  button?: number;
  buttons?: number;
  relatedTarget?: EventTarget;
  regison?: string;
  bubbles?: boolean;
  cancelable?: boolean;
}

/// Return false if canceled
function dispatchMouseEvent(type: MouseEventTypes, element: HTMLElement, options: ActionOptions): boolean {
  const event = new MouseEvent(type, {
    button: 0,
    bubbles: true,
    cancelable: true,
    ctrlKey: options.ctrlKey,
    shiftKey: options.shiftKey,
    altKey: options.altKey,
    metaKey: options.metaKey || options.ctrlKey,
  });
  return element.dispatchEvent(event);
}
