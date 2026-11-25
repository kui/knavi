/* WHY: frames share DOM wrappers, and chrome.dom.openOrClosedShadowRoot()
   creates the root's wrapper in the caller's realm. If a child frame called it
   on its parent's element first, `instanceof` checks in the parent frame would
   fail for that root and everything found through it. So closed roots are
   opened only for elements of this frame's own document. */

/** The open or closed shadow root attached to `element`, or null. */
export function shadowRootOf(element: Element): ShadowRoot | null {
  if (element.shadowRoot) return element.shadowRoot;
  if (element.ownerDocument !== document) return null;
  // WHY: the call is slow enough to delay hints on large pages, so skip elements that cannot have a shadow root.
  if (!canHostShadowRoot(element)) return null;
  return chrome.dom.openOrClosedShadowRoot(element);
}

/** The elements `attachShadow()` accepts, besides custom elements. */
const SHADOW_HOST_NAMES = new Set([
  "article",
  "aside",
  "blockquote",
  "body",
  "div",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "main",
  "nav",
  "p",
  "section",
  "span",
]);

function canHostShadowRoot(element: Element): element is HTMLElement {
  return (
    element instanceof HTMLElement &&
    (element.localName.includes("-") ||
      SHADOW_HOST_NAMES.has(element.localName))
  );
}

/** Like `assignedSlot`, but also finds a `<slot>` in a closed shadow root. */
export function assignedSlotOf(node: Node): HTMLSlotElement | null {
  const slot = (node as Partial<Slottable>).assignedSlot;
  if (slot) return slot;
  const host = node.parentElement;
  if (!host || host.shadowRoot) return null;
  const root = shadowRootOf(host);
  if (!root) return null;
  for (const s of root.querySelectorAll("slot")) {
    if (s.assignedNodes().includes(node)) return s;
  }
  return null;
}

/**
 * Returns iframes that live inside shadow roots reachable from `d`, split by
 * whether reaching them needs a closed shadow root. Skips light-DOM iframes —
 * callers should combine this with `document.getElementsByTagName("iframe")`
 * for the cheap light-DOM pass. Walking every element is unavoidable here:
 * there is no DOM API to enumerate shadow roots directly.
 */
export function listIframesInShadowRoots(d: ParentNode = document): {
  open: HTMLIFrameElement[];
  closed: HTMLIFrameElement[];
} {
  const open: HTMLIFrameElement[] = [];
  const closed: HTMLIFrameElement[] = [];
  for (const { root, throughClosed } of shadowRootsIn(d, false)) {
    (throughClosed ? closed : open).push(...root.querySelectorAll("iframe"));
  }
  return { open, closed };
}

/** The shadow roots reachable from `d`, and whether reaching each one goes through a closed root. */
function* shadowRootsIn(
  d: ParentNode,
  throughClosed: boolean,
): Generator<{ root: ShadowRoot; throughClosed: boolean }> {
  for (const host of d.querySelectorAll("*")) {
    const root = shadowRootOf(host);
    if (!root) continue;
    const closed = throughClosed || root !== host.shadowRoot;
    yield { root, throughClosed: closed };
    yield* shadowRootsIn(root, closed);
  }
}
