export function nextAnimationFrame(): Promise<number> {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

export function isScrollable(element: HTMLElement, style: any): boolean {
  if (element.scrollHeight - element.clientHeight > 10
      && ["auto", "scroll"].includes(style.overflowY)) return true;
  if (element.scrollWidth - element.clientWidth > 10
      && ["auto", "scroll"].includes(style.overflowX)) return true;
  return false;
}

export function isEditable(elem: EventTarget) {
  if (!(elem instanceof HTMLElement)) return false;
  // No-selectable <input> throws an error when "selectionStart" are referred.
  let selectionStart;
  try {
    selectionStart = (elem: any).selectionStart;
  } catch (e) {
    return false;
  }
  return selectionStart != null || elem.contentEditable === "true";
}
