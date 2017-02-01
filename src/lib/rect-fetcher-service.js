// @flow

import { filter, first } from "./iters";
import RectFetcher from "./rect-fetcher";
import ActionHandler from "./action-handlers";
import { recieve, send } from "./chrome-messages";
import settingsClient from "./settings-client";

import type {
  RectHolder,
  AllRectsRequest,
  DescriptionsRequest,
  ActionRequest
} from "./rect-fetcher-client";

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

async function handleAllRectsRequest(req: AllRectsRequest) {
  console.debug("AllRectsRequest req=", req, "location=", location.href);

  const rectFetcher = new RectFetcher(await additionalSelectorsPromise);
  const frameId = await frameIdPromise;

  rectElements = rectFetcher.getAll().map(({ element, rects }, index) => {
    rects = addOffsets(rects, req);
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
  const frames = new Set(
    filter(filter(rectElements,
                  ({ element }) => element.tagName === "IFRAME"),
           ({ element }) => registeredFrames.has((element: any).contentWindow))
  );
  if (frames.size === 0) {
    console.debug("No frames", location.href);
    window.parent.postMessage({ type: "AllRectsResponseComplete" }, "*");
    return;
  }

  console.debug("Send request to child frames", location.href);

  for (const frame of frames) {
    const rect = frame.holder.rects[0];
    (frame.element: any).contentWindow.postMessage(({
      type: ALL_RECTS_REQUEST_TYPE,
      offsetX: rect.left, offsetY: rect.top,
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

function addOffsets(rects, offsets) {
  return rects.map((r) => ({
    top: r.top + offsets.offsetY,
    bottom: r.bottom + offsets.offsetY,
    left: r.left + offsets.offsetX,
    right: r.right + offsets.offsetX,
    height: r.height,
    width: r.width,
  }));
}

function handleRegisterFrame(frame: WindowProxy) {
  if (registeredFrames.has(frame)) return;
  console.debug("New child frame", frame, "parent-location=", location.href);
  registeredFrames.add(frame);
}
