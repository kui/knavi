import {
  flatMap,
  traverseParent,
  filter,
  first,
  takeWhile,
  length
} from "./iters";
import { isScrollable } from "./utils";
import * as vp from "./viewports";
import * as rectUtils from "./rects";
import VisibleRectDetector from "./visible-rect-detector";

export default class RectFetcher {
  constructor(additionalSelectors, caches) {
    this.styleCache = caches.style;
    this.detector = new VisibleRectDetector(caches);
    this.additionalSelectors = additionalSelectors;
  }

  getAll(visualViewport) {
    const layoutVpOffsets = vp.layout.offsets();
    const visualViewportFromLayoutVp = rectUtils.offsets(
      visualViewport,
      layoutVpOffsets
    );
    const t = listAllTarget(this, visualViewportFromLayoutVp);
    return distinctSimilarTarget(this, t, visualViewportFromLayoutVp);
  }
}

const HINTABLE_QUERY = [
  "a[href]",
  "area[href]",
  "details",
  "textarea:not([disabled])",
  "button:not([disabled])",
  "select:not([disabled])",
  "input:not([type=hidden]):not([disabled])",
  "iframe",
  "[tabindex]",
  "[onclick]",
  "[onmousedown]",
  "[onmouseup]",
  "[contenteditable='']",
  "[contenteditable=true]",
  "[role=link]",
  "[role=button]",
  "[data-image-url]"
];

function listAllTarget(self, viewport) {
  const selector = [...HINTABLE_QUERY, ...self.additionalSelectors].join(",");

  function listTargets(doc) {
    const hintables = new Set(doc.querySelectorAll(selector));
    return Array.from(
      flatMap(doc.querySelectorAll("*"), element => {
        function buildTarget() {
          const clickableness = deriveClickableness();
          if (!clickableness) return null;

          const rects = self.detector.get(element, viewport);
          if (rects.length === 0) return null;

          return Object.assign({ element, rects }, clickableness);
        }

        function deriveClickableness() {
          if (hintables.has(element)) {
            return { mayBeClickable: false };
          }

          const style = self.styleCache.get(element);
          if (["pointer", "zoom-in", "zoom-out"].includes(style.cursor)) {
            return { mayBeClickable: true };
          }
          if (isScrollable(element, style)) {
            return { mayBeClickable: false };
          }

          return null;
        }

        let childTargets;
        if (element.shadowRoot) {
          childTargets = listTargets(element.shadowRoot);
        } else {
          childTargets = [];
        }

        const target = buildTarget();
        if (target) {
          return [target, ...childTargets];
        } else {
          return childTargets;
        }
      })
    );
  }

  const startMsec = performance.now();
  const targets = listTargets(document);
  const elapsedMsec = performance.now() - startMsec;

  console.debug(
    "list all elements: elapsedMsec=",
    elapsedMsec,
    "targetElements=",
    targets.length
  );

  return targets;
}

function distinctSimilarTarget(self, targets, viewport) {
  const targetMap = new Map(
    (function*() {
      for (const t of targets) yield [t.element, t];
    })()
  );

  function isVisibleNode(node) {
    // filter out blank text nodes
    if (node instanceof Text) return !/^\s*$/.test(node.textContent);
    // filter out invisible element.
    if (node instanceof Element) {
      if (self.detector.get(node, viewport).length >= 1) return true;
      return false;
    }
    return true;
  }

  function removeFilteredOutElements() {
    for (const [element, target] of targetMap.entries()) {
      if (target.filteredOutBy) targetMap.delete(element);
    }
  }

  let mayBeClickables = targets.filter(t => t.mayBeClickable);

  // Filter out targets which are children of <a> or <button>
  for (let i = 0; i < mayBeClickables.length; i++) {
    const target = mayBeClickables[i];

    const parentTarget = first(
      flatMap(traverseParent(target.element), p => {
        const t = targetMap.get(p);
        if (t == null) return [];
        if (t.filteredOutBy) return [t.filteredOutBy];
        if (["A", "BUTTON"].includes(t.element.tagName)) return [t];
        return [];
      })
    );
    if (parentTarget) {
      target.filteredOutBy = parentTarget;
      console.debug(
        "filter out: a child of a parent <a>/<button>: target=%o",
        target.element
      );
    }
  }

  mayBeClickables = mayBeClickables.filter(t => !t.filteredOutBy);
  removeFilteredOutElements();

  // Filter out targets that is only one child for a parent that is target too.
  for (let i = 0; i < mayBeClickables.length; i++) {
    const target = mayBeClickables[i];
    if (target.filteredOutBy) continue;

    const thinAncestors = takeWhile(traverseParent(target.element), e => {
      return length(filter(e.childNodes, isVisibleNode)) === 1;
    });
    const parentTarget = first(
      flatMap(thinAncestors, p => {
        const t = targetMap.get(p);
        if (t == null) return [];
        if (t.filteredOutBy) return [t.filteredOutBy];
        return [t];
      })
    );
    if (parentTarget) {
      target.filteredOutBy = parentTarget;
      console.debug(
        "filter out: a child of a thin parent: target=%o",
        target.element
      );
    }
  }

  mayBeClickables = mayBeClickables.filter(t => !t.filteredOutBy);
  removeFilteredOutElements();

  // Filter out targets that contains only existing targets
  for (let i = mayBeClickables.length - 1; i >= 0; i--) {
    const target = mayBeClickables[i];
    if (target.filteredOutBy) continue;

    const childNodes = Array.from(
      filter(target.element.childNodes, isVisibleNode)
    );
    if (childNodes.every(c => targetMap.has(c))) {
      const child = childNodes[0];
      target.filteredOutBy = targetMap.get(child);
      console.debug(
        "filter out: only targets containing: target=%o",
        target.element
      );
    }
  }

  return targets.filter(t => t.filteredOutBy == null);
}
