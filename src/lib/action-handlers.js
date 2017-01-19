// @flow

import * as utils from "./utils";

import type { HintedTarget } from "./hinter";

export interface ActionOptions {
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

declare interface Handler {
  shortDescription: string;
  longDescription?: string;
  isSupported(target: HintedTarget): boolean;
  handle(target: HintedTarget, options: ActionOptions): void;
}

const handlers: Handler[] = [];

export default class ActionHandlerDelegater {
  handle(target: HintedTarget, options: ActionOptions) {
    console.log("hit", target.element);
    this.getHandler(target).handle(target, options);
  }

  getDescriptions(target: HintedTarget): { short: string, long: ?string } {
    const h = this.getHandler(target);
    return { short: h.shortDescription, long: h.longDescription };
  }

  getHandler(target: HintedTarget): Handler {
    const h = handlers.find((h) => h.isSupported(target));
    if (h == null) throw Error("Unreachable code");
    return h;
  }
}

handlers.push({
  shortDescription: "Focus iframe",
  isSupported(target: HintedTarget) {
    return target.element.tagName === "IFRAME";
  },
  handle(target: HintedTarget) {
    target.element.focus();
    console.log("Focus iframe");
  }
});

handlers.push({
  shortDescription: "Blur",
  longDescription: "Blur the focused element",
  isSupported(target: HintedTarget) {
    return target.element.tagName === "BODY";
  },
  handle() {
    const activeElement = document.activeElement;
    activeElement.blur();
    console.log(this.longDescription, activeElement);
  }
});

handlers.push({
  shortDescription: "Edit",
  longDescription: "Focus the editable element",
  isSupported(target: HintedTarget) {
    return utils.isEditable(target.element);
  },
  handle(target: HintedTarget) {
    target.element.focus();
    console.log(this.longDescription);
  }
});

handlers.push({
  shortDescription: "Scroll",
  longDescription: "Focus the scrollable element",
  isSupported(target: HintedTarget) {
    return utils.isScrollable(target.element, target.getStyle());
  },
  handle(target: HintedTarget) {
    const element = target.element;
    // Make scrollable from your keyboard
    if (!element.hasAttribute("tabindex")) {
      element.setAttribute("tabindex", "-1");
      element.addEventListener(
        "blur",
        () => element.removeAttribute("tabindex"),
        { once: true }
      );
    }
    element.focus();
    console.log("focus as an scrollable element");
  }
});

handlers.push({
  shortDescription: "Click",
  isSupported() { return true; },
  handle(target: HintedTarget, options: ActionOptions) {
    simulateClick(target.element, options);
    console.log("click");
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
