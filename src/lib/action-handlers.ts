import { nextAnimationFrame } from "./animations";
import { isEditable, isScrollable } from "./elements";

interface ActionHandler {
  getDescriptions(): ActionDescriptions;
  isSupported(target: Element): boolean;
  handle(target: Element, options: MouseEventInit): Promise<void> | void;
}

interface Action {
  descriptions: ActionDescriptions;
  handle(options: MouseEventInit): Promise<void> | void;
}

export class ActionFinder {
  private readonly handlers: ActionHandler[];

  constructor(additionalSelectors: string[]) {
    this.handlers = [...HANDLERS];
    if (additionalSelectors.length > 0) {
      this.handlers.unshift({
        getDescriptions() {
          return { short: "Click" };
        },
        isSupported(target: Element) {
          return target.matches(additionalSelectors.join(","));
        },
        async handle(target: Element, options: MouseEventInit) {
          await simulateClick(target, options);
        },
      });
    }
  }

  find(target: Element): Action | undefined {
    const h = this.handlers.find((h) => h.isSupported(target));
    if (!h) return undefined;
    return {
      descriptions: h.getDescriptions(),
      handle: (options) => h.handle(target, options),
    };
  }
}

const HANDLERS: ActionHandler[] = [];

HANDLERS.push({
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

// -----------------------------------------
// Element Class Specific Handlers
// -----------------------------------------

HANDLERS.push({
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

const CLICKABLE_INPUT_TYPES = new Set([
  "checkbox",
  "radio",
  "button",
  "image",
  "submit",
  "reset",
]);

// input elements for clickable types.
HANDLERS.push({
  getDescriptions() {
    return {
      short: "Click",
      long: "Click the <input> element",
    };
  },
  isSupported(target) {
    return (
      target instanceof HTMLInputElement &&
      !target.disabled &&
      CLICKABLE_INPUT_TYPES.has(target.type)
    );
  },
  async handle(target: HTMLInputElement, options) {
    await simulateClick(target, options);
  },
});

// input elements exclude clickable types.
HANDLERS.push({
  getDescriptions() {
    return {
      short: "Focus",
      long: "Focus the <input> element with picker",
    };
  },
  isSupported(target) {
    return (
      target instanceof HTMLInputElement && !target.readOnly && !target.disabled
    );
  },
  async handle(target: HTMLInputElement) {
    target.focus();
    await nextAnimationFrame();
    target.showPicker();
  },
});

HANDLERS.push({
  getDescriptions() {
    return {
      short: "Open",
      long: "Open the <details> element",
    };
  },
  isSupported(target) {
    return target instanceof HTMLDetailsElement && !target.open;
  },
  handle(target: HTMLDetailsElement) {
    target.open = true;
  },
});

HANDLERS.push({
  getDescriptions() {
    return {
      short: "Close",
      long: "Close the <details> element",
    };
  },
  isSupported(target) {
    return target instanceof HTMLDetailsElement && target.open;
  },
  handle(target: HTMLDetailsElement) {
    target.open = false;
  },
});

HANDLERS.push({
  getDescriptions() {
    return {
      short: "Focus",
      long: "Focus the <select> element",
    };
  },
  isSupported(target) {
    return target instanceof HTMLSelectElement && !target.disabled;
  },
  async handle(target: HTMLSelectElement) {
    target.focus();
    await nextAnimationFrame();
    if ("showPicker" in target && typeof target.showPicker === "function") {
      target.showPicker();
    }
  },
});

// -----------------------------------------
// /Element Class Specific Handlers
// -----------------------------------------

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
HANDLERS.push({
  getDescriptions() {
    return {
      short: "Click",
      long: "Click anchor, button or other clickable elements",
    };
  },
  isSupported(target) {
    return target.matches(CLICKABLE_SELECTORS);
  },
  async handle(target, options) {
    await simulateClick(target, options);
  },
});

HANDLERS.push({
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

HANDLERS.push({
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
    if ("focus" in target && typeof target.focus === "function") {
      target.focus();
    } else {
      console.warn("Cannot focus", target);
    }
  },
});

HANDLERS.push({
  getDescriptions() {
    return {
      short: "Scroll",
      long: "Focus the scrollable element",
    };
  },
  isSupported(target) {
    return isScrollable(target, target.computedStyleMap());
  },
  handle(element) {
    if (!("focus" in element && typeof element.focus === "function")) {
      console.warn("Cannot focus", element);
      return;
    }

    // Make scrollable it with your keyboard.
    if (!element.hasAttribute("tabindex")) {
      element.setAttribute("tabindex", "-1");
      element.addEventListener(
        "blur",
        () => element.removeAttribute("tabindex"),
        { once: true },
      );
    }
    element.focus();
  },
});

async function simulateClick(element: Element, options: MouseEventInit) {
  const sequence = [
    () => dispatchMouseEvent("mouseover", element, options),
    () => dispatchMouseEvent("mousedown", element, options),
    () => {
      if ("focus" in element && typeof element.focus === "function")
        element.focus();
    },
    () => dispatchMouseEvent("mouseup", element, options),
    () => dispatchMouseEvent("click", element, options),
  ];

  for (const task of sequence) {
    task();
    await nextAnimationFrame();
  }
}

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
  if (!element.dispatchEvent(event)) console.debug("canceled", type);
}
