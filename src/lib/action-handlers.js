import * as utils from "./utils";

import type { HintedTarget } from "./hinter";

export interface ActionOptions {
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

export default class ActionHandlerDelegater {
  constructor() {}

  handle(target: HintedTarget, options: ActionOptions) {
    console.log("hit", target.element);

    const element = target.element;
    const style = window.getComputedStyle(element);
    if (utils.isScrollable(element, style)) {
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
      return;
    }
    if (utils.isEditable(element)) {
      element.focus();
      console.log("focus as an editable element");
      return;
    }
    if (element.tagName === "BODY") {
      const activeElement = document.activeElement;
      activeElement.blur();
      console.log("blue an active element: ", activeElement);
      return;
    }
    if (element.tagName === "IFRAME") {
      element.focus();
      console.log("focus as an iframe");
      return;
    }

    simulateClick(element, options);
    console.log("click");
  }
}

function simulateClick(element: HTMLElement, options: ActionOptions) {
  dispatchMouseEvent("mouseover", element, options);

  for (const type of ["mousedown", "mouseup", "click"]) {
    if (!dispatchMouseEvent(type, element, options)) {
      console.debug("Canceled: ", type);
      return false;
    }
  }
  return true;
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
