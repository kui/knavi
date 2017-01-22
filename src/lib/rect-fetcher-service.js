// @flow

import { filter, first } from "./iters";
import RectFetcher from "./rect-fetcher";
import ActionHandler from "./action-handlers";

import type {
  RectHolder,
  AllRectsRequest,
  DescriptionsRequest,
  ActionRequest
} from "./rect-fetcher-client";

export type AllRectsResponseComplete = {
  type: "AllRectsResponseComplete";
};

export type RectsFragmentResponse = {
  type: "RectsFragmentResponse";
  holders: RectHolder[];
};

type RegisterFrame = {
  type: "RegisterFrame";
};

let frameId: number;
let rectFetcher: RectFetcher;
let rectElements: { element: HTMLElement, holder: RectHolder }[];
let actionHandler: ActionHandler = new ActionHandler;
const registeredFrames: Set<WindowProxy> = new Set;

chrome.runtime.sendMessage("getFrameId", (id) => frameId = id);

if (parent !== window) {
  parent.postMessage(({ type: "RegisterFrame" }: RegisterFrame), "*");
}

window.addEventListener("message", (event) => {
  switch (event.data.type) {
  case "AllRectsRequest":
    handleAllRectsRequest(event.data);
    return;
  case "RegisterFrame":
    handleRegisterFrame(event.source);
    return;
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
  case "DescriptionsRequest":
    handleDescriptionsRequest(message, sendResponse);
    return true;
  case "ActionRequest":
    handleActionRequest(message, sendResponse);
    return true;
  }
});

async function handleAllRectsRequest(req: AllRectsRequest) {
  console.debug("AllRectsRequest", location.href);

  rectFetcher = new RectFetcher;

  rectElements = rectFetcher.getAll().map(({ element, rects }, index) => {
    rects = addOffsets(rects, req);
    return { element, holder: { index, frameId, rects } };
  });

  console.debug("rectElements", rectElements.map(({ element }) => element));
  await new Promise((resolve) => {
    chrome.runtime.sendMessage(({
      type: "RectsFragmentResponse",
      holders: rectElements.map((e) => e.holder),
    }: RectsFragmentResponse), resolve);
  });

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
      type: "AllRectsRequest",
      offsetX: req.offsetX + rect.left,
      offsetY: req.offsetY + rect.top,
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

function handleDescriptionsRequest(req: DescriptionsRequest, resolve) {
  const { element } = rectElements[req.index];
  const descs = actionHandler.getDescriptions(element);
  resolve(descs);
}

function handleActionRequest(req: ActionRequest, resolve) {
  const { element } = rectElements[req.index];
  actionHandler.handle(element, req.options);
  resolve();
}
