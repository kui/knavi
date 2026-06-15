import { Router, sendToTab, type Messages } from "../lib/chrome-messages";
import { requireTabId } from "./sender-guards";
import { getAllFrameIds } from "./frame-registry";
import { Rect } from "../lib/rects";

export const router = Router.newInstance()
  .add("InitAllRects", async ({ requestId }, sender) => {
    const tabId = requireTabId(sender);
    const frameIds = getAllFrameIds(tabId);

    const responses = await Promise.allSettled(
      frameIds.map(async (frameId) => {
        const response = await sendToTab(
          tabId,
          "FetchFrameRects",
          { requestId },
          { frameId },
        );
        return { frameId, response };
      }),
    );

    const frameData = new Map<number, FrameResponse>();
    for (const result of responses) {
      if (result.status === "fulfilled") {
        frameData.set(result.value.frameId, result.value.response);
      } else {
        console.debug("FetchFrameRects failed:", result.reason);
      }
    }

    const composed = composeFrame(0, { x: 0, y: 0 }, null, frameData);

    // Always send ResponseRectsFragment (even when empty) so that the
    // root frame's aggregate() generator receives at least one message
    // and does not hang indefinitely.
    await sendToTab(
      tabId,
      "ResponseRectsFragment",
      { requestId, rects: composed },
      { frameId: 0 },
    );
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

type FrameResponse = Messages["FetchFrameRects"]["response"];
type ClipRect = RectJSON<"actual-viewport", "root-viewport">;

function composeFrame(
  frameId: number,
  offset: FrameOffset,
  clip: ClipRect | null,
  frameData: Map<number, FrameResponse>,
): ElementRects[] {
  const data = frameData.get(frameId);
  if (!data) {
    if (frameId === 0) {
      console.warn(
        "Root frame did not respond to FetchFrameRects; no rects will be composed.",
      );
    }
    return [];
  }

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

  for (const child of data.childIframes) {
    const childOffset: FrameOffset = {
      x: offset.x + child.contentOffsets.x,
      y: offset.y + child.contentOffsets.y,
    };

    const translatedVisible: ClipRect = {
      ...child.visibleViewport,
      x: child.visibleViewport.x + offset.x,
      y: child.visibleViewport.y + offset.y,
      origin: "root-viewport",
    };
    const childClip: ClipRect | null =
      clip === null
        ? translatedVisible
        : Rect.intersection(translatedVisible.type, translatedVisible, clip);

    result.push(
      ...composeFrame(child.childFrameId, childOffset, childClip, frameData),
    );
  }

  return result;
}
