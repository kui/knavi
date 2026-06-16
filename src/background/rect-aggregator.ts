import { Router, sendToTab, type Messages } from "../lib/chrome-messages";
import { requireTabId } from "./sender-guards";
import { getAllFrameIds } from "./frame-registry";
import { Coordinates, Rect } from "../lib/rects";

export const router = Router.newInstance()
  .add("InitAllRects", async (_payload, sender) => {
    const tabId = requireTabId(sender);
    const frameIds = getAllFrameIds(tabId);

    const responses = await Promise.allSettled(
      frameIds.map(async (frameId) => {
        const response = await sendToTab(tabId, "FetchFrameRects", undefined, {
          frameId,
        });
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

    const rootOrigin = new Coordinates<"root-viewport", "layout-viewport">({
      type: "root-viewport",
      origin: "layout-viewport",
      x: 0,
      y: 0,
    });
    return composeFrame(0, rootOrigin, null, frameData);
  })

  .add("ExecuteAction", async (message, sender) => {
    await sendToTab(requireTabId(sender), "ExecuteAction", message, {
      frameId: message.id.frameId,
    });
  });

type FrameResponse = Messages["FetchFrameRects"]["response"];
type ClipRect = RectJSON<"actual-viewport", "root-viewport">;

// The root-viewport origin expressed in a frame's own layout-viewport
// coordinates. Re-expressing any frame-local rect in root-viewport coordinates
// is then just rect.offsets(frameOrigin). The root frame's value is (0, 0).
type FrameOrigin = Coordinates<"root-viewport", "layout-viewport">;

function composeFrame(
  frameId: number,
  frameOrigin: FrameOrigin,
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
      .map((r) => new Rect(r).offsets(frameOrigin))
      .filter(
        (r) =>
          clip === null ||
          Rect.intersectionAs("element-border", r, clip) !== null,
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
    // The child frame's layout-viewport origin coincides with its iframe
    // content-box origin in this frame, so relabel the content origin as the
    // child's layout-viewport origin.
    const childOrigin = new Coordinates<"root-viewport", "layout-viewport">({
      ...frameOrigin.offsets(new Coordinates(child.contentOffsets)),
      origin: "layout-viewport",
    });

    const translatedVisible: ClipRect = new Rect(child.visibleViewport).offsets(
      frameOrigin,
    );
    const childClip: ClipRect | null =
      clip === null
        ? translatedVisible
        : Rect.intersection(translatedVisible, clip);

    result.push(
      ...composeFrame(child.childFrameId, childOrigin, childClip, frameData),
    );
  }

  return result;
}
