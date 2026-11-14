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
 *   - "s<n>": the n-th iframe of `listIframesInShadowRoots()` in the parent.
 *     Such iframes are not in `window.frames`.
 * The top frame's path is `[]`.
 *
 * Chrome has no content-script API that maps a Window or iframe element to a
 * frameId (`runtime.getFrameId` is Firefox-only; see #90), and the old
 * child → parent postMessage handshake broke pages that listen to `message`
 * events (#146). Paths replace it: each frame computes its own path and
 * reports it to the background, which maps it to `sender.frameId`.
 */
export class FramePath {
  private assigned: string[] | undefined;
  /** Whether `assigned` arrived after the last hint session ended. */
  private assignedThisSession = false;

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
    const own = this.current();
    let shadowIframes: HTMLIFrameElement[] | undefined;
    return iframes.map((iframe) => {
      const w = iframe.contentWindow;
      if (!own || !w) return undefined;
      const index = indexInFrames(window, w);
      if (index >= 0) return [...own, String(index)];
      shadowIframes ??= [...listIframesInShadowRoots()];
      const shadowIndex = shadowIframes.indexOf(iframe);
      return shadowIndex >= 0 ? [...own, `s${shadowIndex}`] : undefined;
    });
  }

  childPath(iframe: HTMLIFrameElement): string[] | undefined {
    return this.childPaths([iframe])[0];
  }

  findChild(segment: string): HTMLIFrameElement | undefined {
    if (segment.startsWith("s")) {
      return [...listIframesInShadowRoots()][Number(segment.slice(1))];
    }
    const w = window.frames[Number(segment)] as Window | undefined;
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

  /** Handles the SyncHintingState broadcast. */
  handleHintingState(active: boolean): void {
    if (active) this.announce().catch(printError);
    else this.assignedThisSession = false;
  }

  /**
   * Reports this frame's path to the background and assigns the paths of the
   * children that cannot work out theirs. Called when a hint session starts.
   * An assigned path is reported only if it arrived for this session: one
   * kept from a previous session may be stale, and the fresh one is reported
   * when it arrives.
   */
  async announce(): Promise<void> {
    const computed = computeOwnPath();
    this.assignToChildren(computed);
    /* WHY: the parent's assignment for this session can arrive before this
       frame's own SyncHintingState, while it is not hinting yet. */
    const assigned = this.assignedThisSession ? this.assigned : undefined;
    await this.reportPath(computed ?? assigned);
  }

  private async reportPath(path: string[] | undefined): Promise<void> {
    if (path) await sendToRuntime("ReportFramePath", { path });
  }

  /**
   * Handles a path assignment from the parent frame. A valid assignment is
   * always passed on to the children, and reported while a hint session is
   * running.
   */
  handleMessage(e: MessageEvent, isHinting: boolean): void {
    const data = e.data as Partial<FramePathAssignment> | null | undefined;
    if (data?.["@type"] !== ASSIGNMENT_TYPE) return;
    if (parent === window || e.source !== parent) return;
    const { path } = data;
    if (!Array.isArray(path) || !path.every((s) => typeof s === "string"))
      return;
    this.assigned = path;
    this.assignedThisSession = true;
    const computed = computeOwnPath();
    /* WHY: a child keeps its assignment across sessions, so it must hear this
       one again even when this frame's path did not change. */
    this.assignToChildren(computed);
    // WHY: outside a hint session nothing consumes the report.
    if (isHinting) this.reportPath(computed ?? path).catch(printError);
  }

  /**
   * INVARIANT: a parent → child postMessage is only used for children that
   * cannot compute their own path: cross-origin iframes in shadow roots, and
   * every descendant of a frame whose own path was assigned (their chain to
   * the top is broken at that frame).
   */
  assignToChildren(computed: string[] | undefined = computeOwnPath()): void {
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

    let shadowIndex = 0;
    for (const iframe of listIframesInShadowRoots()) {
      // WHY: a same-origin child finds its own path through `frameElement`.
      if (!computed || !iframe.contentDocument) {
        post(iframe.contentWindow, `s${shadowIndex}`);
      }
      shadowIndex++;
    }
    if (computed) return;
    for (let i = 0; i < window.frames.length; i++) {
      post(window.frames[i], String(i));
    }
  }
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
  if (index >= 0) return String(index);
  try {
    const iframe = child.frameElement;
    if (!iframe) return undefined;
    // WHY: the parent's elements belong to another realm, so `instanceof` is false.
    const shadowIndex = [
      ...listIframesInShadowRoots(iframe.ownerDocument),
    ].indexOf(iframe as HTMLIFrameElement);
    return shadowIndex >= 0 ? `s${shadowIndex}` : undefined;
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
