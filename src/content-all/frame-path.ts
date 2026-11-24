import { listIframesInShadowRoots } from "../dom/elements";
import { sendToRuntime } from "../lib/chrome-messages";
import { printError } from "../lib/errors";

const ASSIGNMENT_TYPE = "com.github.kui.knavi.FramePathAssignment";

interface FramePathAssignment {
  "@type": typeof ASSIGNMENT_TYPE;
  path: string[];
}

/**
 * A frame's address within its tab: one segment per hop from the top frame.
 *   - "<n>": `window.frames[n]` of the parent.
 *   - "s<n>": the n-th iframe of `shadowIframes()` in the parent. Such
 *     iframes are not in `window.frames`.
 * The top frame's path is `[]`.
 *
 * Chrome has no content-script API that maps a Window or iframe element to a
 * frameId, and a message from a child to its parent page can break pages that
 * listen to `message` events. So each frame computes its own path and reports
 * it to the background, which maps it to `sender.frameId`.
 */
export class FramePath {
  private assigned: string[] | undefined;
  private hinting = false;

  /** This frame's path, or undefined if it cannot be determined (yet). */
  current(): string[] | undefined {
    return computeOwnPath() ?? this.assigned;
  }

  matches(path: readonly string[]): boolean {
    const own = this.current();
    return own != null && samePath(own, path);
  }

  /** The paths of direct child iframes; undefined for an unmappable one. */
  childPaths(iframes: readonly HTMLIFrameElement[]): (string[] | undefined)[] {
    const own = computeOwnPath() ?? this.assigned;
    let shadow: HTMLIFrameElement[] | undefined;
    return iframes.map((iframe) => {
      const w = iframe.contentWindow;
      if (!own || !w) return undefined;
      const index = indexInFrames(window, w);
      if (index >= 0) return [...own, encodeSegment(false, index)];
      shadow ??= shadowIframes().iframes;
      const shadowIndex = shadow.indexOf(iframe);
      return shadowIndex >= 0
        ? [...own, encodeSegment(true, shadowIndex)]
        : undefined;
    });
  }

  findChild(segment: string): HTMLIFrameElement | undefined {
    const parsed = parseSegment(segment);
    if (!parsed) return undefined;
    if (parsed.shadow) return shadowIframes().iframes[parsed.index];
    const w = window.frames[parsed.index] as Window | undefined;
    if (!w) return undefined;
    for (const iframe of document.getElementsByTagName("iframe")) {
      if (iframe.contentWindow === w) return iframe;
    }
    return undefined;
  }

  /**
   * Reports the path of a frame whose content script starts after the hint
   * session did, so it missed the SyncHintingState broadcast (#95, #109).
   * The background ignores the report when no session is running.
   */
  async reportAtStartup(): Promise<void> {
    await this.reportPath(computeOwnPath());
  }

  handleHintingState(active: boolean): void {
    this.hinting = active;
    if (active) this.announce().catch(printError);
  }

  /**
   * Reports this frame's path to the background and assigns the paths of the
   * children that cannot work out theirs. Called when a hint session starts.
   */
  async announce(): Promise<void> {
    const computed = computeOwnPath();
    this.assignToChildren(computed, "session-start");
    await this.reportPath(computed ?? this.assigned);
  }

  private async reportPath(path: string[] | undefined): Promise<void> {
    if (path) await sendToRuntime("ReportFramePath", { path });
  }

  /**
   * Handles a path assignment from the parent frame. A valid assignment is
   * always passed on to the children, and reported while a hint session is
   * running.
   */
  handleMessage(e: MessageEvent): void {
    const data = e.data as Partial<FramePathAssignment> | null | undefined;
    if (data?.["@type"] !== ASSIGNMENT_TYPE) return;
    if (parent === window || e.source !== parent) return;
    const { path } = data;
    if (
      !Array.isArray(path) ||
      path.length === 0 ||
      !path.every((s) => typeof s === "string")
    )
      return;
    this.assigned = path;
    const computed = computeOwnPath();
    /* WHY: a child keeps its assignment across sessions, so it must hear this
       one again even when this frame's path did not change. */
    this.assignToChildren(computed, "assignment");
    // WHY: outside a hint session nothing consumes the report.
    if (this.hinting) this.reportPath(computed ?? path).catch(printError);
  }

  /**
   * Posts a path assignment to each child that cannot compute its own path
   * (see `needsAssignment`).
   *
   * INVARIANT: each child gets one message per session. A frame with a
   * computed path posts when the session starts, and a frame with an assigned
   * path posts when its own assignment arrives, whichever of the two comes
   * first.
   */
  private assignToChildren(
    computed: string[] | undefined,
    trigger: "session-start" | "assignment",
  ): void {
    if ((trigger === "session-start") !== (computed != null)) return;
    const own = computed ?? this.assigned;
    if (!own) return;
    const post = (w: Window | null, segment: string) =>
      w?.postMessage(
        {
          "@type": ASSIGNMENT_TYPE,
          path: [...own, segment],
        } satisfies FramePathAssignment,
        "*",
      );

    const { iframes, firstClosed } = shadowIframes();
    iframes.forEach((iframe, i) => {
      // WHY: a child cannot see its parent's closed shadow roots (see shadowRootOf()), so it never computes a path through one.
      if (i >= firstClosed || needsAssignment(computed, iframe, true)) {
        post(iframe.contentWindow, encodeSegment(true, i));
      }
    });
    for (const iframe of document.getElementsByTagName("iframe")) {
      const w = iframe.contentWindow;
      const index = w ? indexInFrames(window, w) : -1;
      if (index >= 0 && needsAssignment(computed, iframe, false)) {
        post(w, encodeSegment(false, index));
      }
    }
  }
}

/**
 * Whether a child iframe cannot compute its own path, so its parent has to
 * assign it. `parentPath` is the parent's computed path, if it has one.
 *   - Every child of a parent with an assigned path: the chain to the top is
 *     broken at the parent.
 *   - A child in a shadow root, or any child of a parent whose path has a
 *     shadow-root hop: it needs the `frameElement` of a hop, which only a
 *     same-origin frame can read. `contentDocument` is null for a
 *     cross-origin child.
 */
function needsAssignment(
  parentPath: string[] | undefined,
  child: HTMLIFrameElement,
  inShadowRoot: boolean,
): boolean {
  if (!parentPath) return true;
  const hasShadowHop = parentPath.some((s) => parseSegment(s)?.shadow);
  return (inShadowRoot || hasShadowHop) && !child.contentDocument;
}

function encodeSegment(shadow: boolean, index: number): string {
  return `${shadow ? "s" : ""}${index}`;
}

function parseSegment(
  segment: string,
): { shadow: boolean; index: number } | undefined {
  const m = /^(s?)(\d+)$/.exec(segment);
  return m ? { shadow: m[1] === "s", index: Number(m[2]) } : undefined;
}

/**
 * The iframes in shadow roots of `doc`, in the order segments count them, and
 * the index of the first one behind a closed shadow root.
 * INVARIANT: iframes behind a closed shadow root come last, so a child frame,
 * which lists its parent's iframes without them, numbers the others the same
 * way the parent does.
 */
function shadowIframes(doc: Document = document): {
  iframes: HTMLIFrameElement[];
  firstClosed: number;
} {
  const { open, closed } = listIframesInShadowRoots(doc);
  return { iframes: [...open, ...closed], firstClosed: open.length };
}

function samePath(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((s, i) => s === b[i]);
}

function indexInFrames(parentWindow: Window, child: Window): number {
  const frames = parentWindow.frames;
  for (let i = 0; i < frames.length; i++) {
    if (frames[i] === child) return i;
  }
  return -1;
}

function segmentInParent(child: Window): string | undefined {
  const index = indexInFrames(child.parent, child);
  if (index >= 0) return encodeSegment(false, index);
  try {
    const iframe = child.frameElement;
    if (!iframe) return undefined;
    // WHY: the parent's elements belong to another realm, so `instanceof` is false.
    const shadowIndex = shadowIframes(iframe.ownerDocument).iframes.indexOf(
      iframe as HTMLIFrameElement,
    );
    return shadowIndex >= 0 ? encodeSegment(true, shadowIndex) : undefined;
  } catch {
    return undefined;
  }
}

/** Counts the path up to the top frame, or undefined if any hop is unmappable. */
function computeOwnPath(): string[] | undefined {
  const path: string[] = [];
  let w: Window = window;
  while (w.parent !== w) {
    const segment = segmentInParent(w);
    if (segment == null) return undefined;
    path.unshift(segment);
    w = w.parent;
  }
  return path;
}
