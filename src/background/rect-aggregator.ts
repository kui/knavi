import { Router, sendToTab, type Messages } from "../lib/chrome-messages";
import { requireTabId } from "./sender-guards";
import { getAllFrameIds } from "./frame-registry";
import { Rect } from "../lib/rects";

export const router = Router.newInstance()
  .add("InitAllRects", async ({ requestId }, sender) => {
    const tabId = requireTabId(sender);
    const frameIds = getAllFrameIds(tabId);

    // Each frame's local rects can only be placed in root-viewport coordinates
    // once the cumulative offset/clip of its whole ancestor chain is known. We
    // therefore fan out to every frame in parallel and, as each response
    // arrives, emit a ResponseRectsFragment for any frame whose placement and
    // own data are both available — streaming hints to the root frame instead
    // of waiting for the slowest frame.
    const frameData = new Map<number, FrameResponse>();
    const placements = new Map<number, FramePlacement>([
      [0, { offset: { x: 0, y: 0 }, clip: null }],
    ]);
    const emitted = new Set<number>();
    const sends: Promise<void>[] = [];

    const emitFrame = (frameId: number): void => {
      if (emitted.has(frameId)) return;
      const placement = placements.get(frameId);
      const data = frameData.get(frameId);
      if (!placement || !data) return; // wait for ancestors or own response

      emitted.add(frameId);

      const rects = composeElements(frameId, data, placement);
      if (rects.length > 0) {
        sends.push(
          sendToTab(
            tabId,
            "ResponseRectsFragment",
            { requestId, rects },
            { frameId: 0 },
          ),
        );
      }

      // This frame's data carries the geometry of its direct children, so their
      // placements become computable now; try to emit any already-received ones.
      for (const child of data.childIframes) {
        placements.set(child.childFrameId, childPlacement(placement, child));
        emitFrame(child.childFrameId);
      }
    };

    await Promise.allSettled(
      frameIds.map(async (frameId) => {
        try {
          frameData.set(
            frameId,
            await sendToTab(
              tabId,
              "FetchFrameRects",
              { requestId },
              { frameId },
            ),
          );
          emitFrame(frameId);
        } catch (e) {
          console.debug("FetchFrameRects failed:", e);
        }
      }),
    );

    if (!frameData.has(0)) {
      console.warn(
        "Root frame did not respond to FetchFrameRects; no rects will be composed.",
      );
    }

    // Guarantee at least one message so the root frame's aggregate() generator
    // does not hang when no frame produced any rect.
    if (sends.length === 0) {
      sends.push(
        sendToTab(
          tabId,
          "ResponseRectsFragment",
          { requestId, rects: [] },
          { frameId: 0 },
        ),
      );
    }
    await Promise.allSettled(sends);
  })

  .add("ExecuteAction", async (message, sender) => {
    await sendToTab(requireTabId(sender), "ExecuteAction", message, {
      frameId: message.id.frameId,
    });
  });

interface FrameOffset {
  x: number;
  y: number;
}

interface FramePlacement {
  offset: FrameOffset;
  clip: ClipRect | null;
}

type FrameResponse = Messages["FetchFrameRects"]["response"];
type ChildIframe = FrameResponse["childIframes"][number];
type ClipRect = RectJSON<"actual-viewport", "root-viewport">;

// Translate a frame's local element rects into root-viewport coordinates and
// drop those clipped away by the frame's visible viewport chain.
function composeElements(
  frameId: number,
  data: FrameResponse,
  { offset, clip }: FramePlacement,
): ElementRects[] {
  const result: ElementRects[] = [];
  for (const elem of data.elements) {
    const translatedRects = elem.rects
      .map((r) => ({
        ...r,
        x: r.x + offset.x,
        y: r.y + offset.y,
        origin: "root-viewport" as const,
      }))
      .filter(
        (r) =>
          clip === null ||
          Rect.intersection("element-border", r, clip) !== null,
      );
    if (translatedRects.length > 0) {
      result.push({
        id: { index: elem.index, frameId },
        rects: translatedRects,
        descriptions: elem.descriptions,
      });
    }
  }
  return result;
}

// Compose a child frame's placement from its parent's placement and the child
// geometry the parent reported.
function childPlacement(
  parent: FramePlacement,
  child: ChildIframe,
): FramePlacement {
  const offset: FrameOffset = {
    x: parent.offset.x + child.contentOffsets.x,
    y: parent.offset.y + child.contentOffsets.y,
  };

  const translatedVisible: ClipRect = {
    ...child.visibleViewport,
    x: child.visibleViewport.x + parent.offset.x,
    y: child.visibleViewport.y + parent.offset.y,
    origin: "root-viewport",
  };
  const clip: ClipRect | null =
    parent.clip === null
      ? translatedVisible
      : Rect.intersection(
          translatedVisible.type,
          translatedVisible,
          parent.clip,
        );

  return { offset, clip };
}
