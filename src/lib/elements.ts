export function isScrollable(element: Element, style: CSSStyleDeclaration) {
  if (
    element.scrollHeight - element.clientHeight > 10 &&
    ["auto", "scroll"].includes(style.overflowY)
  )
    return true;
  if (
    element.scrollWidth - element.clientWidth > 10 &&
    ["auto", "scroll"].includes(style.overflowX)
  )
    return true;
  return false;
}

export function isEditable(element: EventTarget) {
  try {
    // Non-selectable <input> throws an error when "selectionStart" are referred.
    if ("selectionStart" in element && element.selectionStart) return true;
  } catch (e) {
    return false;
  }

  return "contentEditable" in element && element.contentEditable === "true";
}

export function* traverseParent(
  element: Element,
  includeSelf?: boolean,
): Generator<Element> {
  let p = includeSelf ? element : element.parentElement;
  while (p) {
    yield p;
    p = p.parentElement;
  }
}

export function* traverseFirstChild(
  element: Element,
  includeSelf?: boolean,
): Generator<Element> {
  let c = includeSelf ? [element] : element.children;
  while (c.length >= 1) {
    yield c[0];
    c = c[0].children;
  }
}

export function applyStyle<E extends HTMLElement>(
  element: E,
  ...styles: Partial<CSSStyleDeclaration>[]
): E {
  Object.assign(element.style, ...styles);
  return element;
}
