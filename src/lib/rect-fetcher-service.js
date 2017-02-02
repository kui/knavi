// @flow

import { filter, first } from "./iters";
import RectFetcher from "./rect-fetcher";
import ActionHandler from "./action-handlers";
import { recieve, send } from "./chrome-messages";
import settingsClient from "./settings-client";
import * as rectUtils from "./rects";
import * as vp from "./viewports";
import Cache from "./cache";

import type {
  RectHolder,
  AllRectsRequest,
  DescriptionsRequest,
  ActionRequest
} from "./rect-fetcher-client";
import type { Rect } from "./rects";

export type GetFrameId = {
  type: "GetFrameId";
};

// Donot import from rect-fetcher-client because it might start event listeners
const ALL_RECTS_REQUEST_TYPE = "jp-k-ui-knavi-AllRectsRequest";

const REGISTE_FRAME_TYPE =   "jp-k-ui-knavi-RegisterFrame";
type RegisterFrame = { type: "jp-k-ui-knavi-RegisterFrame" };

let rectElements: { element: HTMLElement, holder: RectHolder }[];
let actionHandler: ActionHandler = new ActionHandler;
const registeredFrames: Set<WindowProxy> = new Set;

const frameIdPromise = send(({ type: "GetFrameId" }: GetFrameId));

recieve("DescriptionsRequest", (req: DescriptionsRequest, sender, sendResponse) => {
  const { element } = rectElements[req.index];
  const descs = actionHandler.getDescriptions(element);
  sendResponse(descs);
});

recieve("ActionRequest", (req: ActionRequest, sender, sendResponse) => {
  const { element } = rectElements[req.index];
  actionHandler.handle(element, req.options);
  sendResponse();
});

let additionalSelectorsPromise = settingsClient.getMatchedSelectors(location.href);
additionalSelectorsPromise
  .then((s) => { if (s.length >= 1) console.debug("mached additional selectors", s); });

if (parent !== window) {
  parent.postMessage(({ type: REGISTE_FRAME_TYPE }: RegisterFrame), "*");
}

window.addEventListener("message", (event) => {
  switch (event.data.type) {
  case ALL_RECTS_REQUEST_TYPE:
    handleAllRectsRequest(event.data);
    return;
  case REGISTE_FRAME_TYPE:
    handleRegisterFrame(event.source);
    return;
  }
});

export type AllRectsResponseComplete = {
  type: "AllRectsResponseComplete";
};

export type RectsFragmentResponse = {
  type: "RectsFragmentResponse";
  holders: RectHolder[];
  clientFrameId: number;
};

export type DomCaches = {
  style: Cache<HTMLElement, CSSStyleDeclaration>;
  clientRects: Cache<HTMLElement, Rect[]>;
};

async function handleAllRectsRequest(req: AllRectsRequest) {
  console.debug("AllRectsRequest req=", req, "location=", location.href);

  const visualVpOffsets = vp.visual.offsets();
  const visualViewport = rectUtils.move(req.viewport, visualVpOffsets);

  const caches: DomCaches = {
    style: new Cache((e: HTMLElement) => window.getComputedStyle(e)),
    clientRects: new Cache((e) => Array.from(e.getClientRects())),
  };
  const rectFetcher = new RectFetcher(await additionalSelectorsPromise, caches);
  const frameId = await frameIdPromise;

  rectElements = rectFetcher.getAll(visualViewport).map(({ element, rects }, index) => {
    rects = rects.map((r) => rectUtils.move(r, req.offsets));
    return { element, holder: { index, frameId, rects } };
  });

  console.debug("rectElements", rectElements.map(({ element }) => element));
  await send(({
    type: "RectsFragmentResponse",
    holders: rectElements.map((e) => e.holder),
    clientFrameId: req.clientFrameId,
  }: RectsFragmentResponse));

  // Propagate requests to child frames
  // Child frames require to be visible by above rect detection, and
  // be registered by a init "RegisterFrame" message.
  const frames = new Set(filter(rectElements, ({ element }) => {
    return registeredFrames.has((element: any).contentWindow);
  }));
  if (frames.size === 0) {
    console.debug("No frames", location.href);
    window.parent.postMessage({ type: "AllRectsResponseComplete" }, "*");
    return;
  }

  console.debug("Send request to child frames", location.href);

  const layoutVpOffsets = vp.layout.offsets();
  const visualVpOffsetsFromLayoutVp = {
    y: visualVpOffsets.y - layoutVpOffsets.y,
    x: visualVpOffsets.x - layoutVpOffsets.x,
  };
  for (const frame of frames) {
    const clientRect = rectUtils.move(
      rectUtils.offsets(
        caches.clientRects.get(frame.element)[0],
        visualVpOffsetsFromLayoutVp
      ),
      req.offsets
    );
    const style = caches.style.get(frame.element);
    const borderTopWidth = parsePx(style.borderTopWidth) || 0;
    const borderLeftWidth = parsePx(style.borderLeftWidth) || 0;
    const offsets = {
      x: clientRect.left + borderLeftWidth,
      y: clientRect.top + borderTopWidth,
    };
    const viewport = rectUtils.offsets(frame.holder.rects[0], offsets);
    (frame.element: any).contentWindow.postMessage(({
      type: ALL_RECTS_REQUEST_TYPE,
      viewport,
      offsets,
      clientFrameId: req.clientFrameId,
    }: AllRectsRequest), "*");
  }

  // Handle reqest complete
  let responseCompleteHandler;
  let timeoutId;
  window.addEventListener("message", responseCompleteHandler = (event) => {
    if (event.source === window) return;
    if (event.data.type !== "AllRectsResponseComplete") return;

    const frame = first(filter(frames,
                               ({element}) => element.contentWindow === event.source));
    if (!frame) return;
    frames.delete(frame);
    console.debug("Request complete: ", frame, "frames.size=", frames.size);
    if (frames.size === 0) {
      window.parent.postMessage({ type: "AllRectsResponseComplete" }, "*");
      window.removeEventListener("message", responseCompleteHandler);
      clearTimeout(timeoutId);
    }
  });
  // Fetching complete timeout
  timeoutId = setTimeout(() => {
    console.warn("Timeout: no response child frames=", frames, "location=", location.href);
    window.parent.postMessage({ type: "AllRectsResponseComplete" }, "*");
    window.removeEventListener("message", responseCompleteHandler);
  }, 1000);
}

function handleRegisterFrame(frame: WindowProxy) {
  if (registeredFrames.has(frame)) return;
  console.debug("New child frame", frame, "parent-location=", location.href);
  registeredFrames.add(frame);
}

function parsePx(s) {
  const m = (/(\d+)px/).exec(s);
  return m && parseInt(m[1]);
}
