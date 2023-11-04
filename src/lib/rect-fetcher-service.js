import { filter, first } from "./iters.js";
import RectFetcher from "./rect-fetcher.js";
import ActionHandler from "./action-handlers.js";
import { recieve, send } from "./chrome-messages.js";
import settingsClient from "./settings-client.js";
import * as rectUtils from "./rects.js";
import * as vp from "./viewports.js";
import Cache from "./cache.js";

// Donot import from rect-fetcher-client because it might start event listeners
const ALL_RECTS_REQUEST_TYPE = "jp-k-ui-knavi-AllRectsRequest";

const REGISTE_FRAME_TYPE = "jp-k-ui-knavi-RegisterFrame";

let rectElements;
const actionHandler = new ActionHandler();
const registeredFrames = new Set();

const frameIdPromise = send({ type: "GetFrameId" });

recieve("DescriptionsRequest", (req, sender, sendResponse) => {
  const { element } = rectElements[req.index];
  const descs = actionHandler.getDescriptions(element);
  sendResponse(descs);
});

recieve("ActionRequest", (req, sender, sendResponse) => {
  const { element } = rectElements[req.index];
  actionHandler.handle(element, req.options);
  sendResponse();
});

const additionalSelectorsPromise = settingsClient.getMatchedSelectors(
  location.href,
);
additionalSelectorsPromise.then((s) => {
  if (s.length >= 1) console.debug("mached additional selectors", s);
});

if (parent !== window) {
  parent.postMessage({ type: REGISTE_FRAME_TYPE }, "*");
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

async function handleAllRectsRequest(req) {
  console.debug("AllRectsRequest req=", req, "location=", location.href);

  const visualVpOffsets = vp.visual.offsets();
  const visualViewport = rectUtils.move(req.viewport, visualVpOffsets);

  const caches = {
    style: new Cache((e) => window.getComputedStyle(e)),
    clientRects: new Cache((e) => Array.from(e.getClientRects())),
  };
  const rectFetcher = new RectFetcher(await additionalSelectorsPromise, caches);
  const frameId = await frameIdPromise;

  rectElements = rectFetcher
    .getAll(visualViewport)
    .map(({ element, rects }, index) => {
      rects = rects.map((r) => rectUtils.move(r, req.offsets));
      return { element, holder: { index, frameId, rects } };
    });

  console.debug(
    "rectElements",
    rectElements.map(({ element }) => element),
  );
  await send({
    type: "RectsFragmentResponse",
    holders: rectElements.map((e) => e.holder),
    clientFrameId: req.clientFrameId,
  });

  // Propagate requests to child frames
  // Child frames require to be visible by above rect detection, and
  // be registered by a init "RegisterFrame" message.
  const frames = new Set(
    filter(rectElements, ({ element }) => {
      return registeredFrames.has(element.contentWindow);
    }),
  );
  if (frames.size === 0) {
    console.debug("No visible frames", location.href);
    window.parent.postMessage({ type: "AllRectsResponseComplete" }, "*");
    return;
  }

  console.debug("Send request to child frames", location.href);

  const layoutVpOffsets = vp.layout.offsets();
  const layoutVpOffsetsFromRootVisualVp = {
    y: layoutVpOffsets.y - visualVpOffsets.y + req.offsets.y,
    x: layoutVpOffsets.x - visualVpOffsets.x + req.offsets.x,
  };
  for (const frame of frames) {
    const borderWidth = getBorderWidth(frame.element, caches);
    const clientRect = rectUtils.move(
      caches.clientRects.get(frame.element)[0],
      layoutVpOffsetsFromRootVisualVp,
    );
    const iframeViewport = rectUtils.excludeBorders(clientRect, borderWidth);
    const offsets = {
      x: iframeViewport.left,
      y: iframeViewport.top,
    };
    const croppedRect = frame.holder.rects[0];
    const viewport = rectUtils.intersection(croppedRect, iframeViewport);
    if (!viewport) {
      frames.delete(frame);
      continue;
    }
    frame.element.contentWindow.postMessage(
      {
        type: ALL_RECTS_REQUEST_TYPE,
        viewport: rectUtils.offsets(viewport, offsets),
        offsets,
        clientFrameId: req.clientFrameId,
      },
      "*",
    );
  }
  if (frames.size === 0) {
    console.debug("No visible frames", location.href);
    window.parent.postMessage({ type: "AllRectsResponseComplete" }, "*");
    return;
  }

  // Handle reqest complete
  let responseCompleteHandler;
  // eslint-disable-next-line prefer-const
  let timeoutId;
  window.addEventListener(
    "message",
    (responseCompleteHandler = (event) => {
      if (event.source === window) return;
      if (event.data.type !== "AllRectsResponseComplete") return;

      const frame = first(
        filter(
          frames.values(),
          ({ element }) => element.contentWindow === event.source,
        ),
      );
      if (!frame) return;
      frames.delete(frame);
      console.debug("Request complete: ", frame, "frames.size=", frames.size);
      if (frames.size === 0) {
        window.parent.postMessage({ type: "AllRectsResponseComplete" }, "*");
        window.removeEventListener("message", responseCompleteHandler);
        clearTimeout(timeoutId);
      }
    }),
  );
  // Fetching complete timeout
  timeoutId = setTimeout(() => {
    console.warn(
      "Timeout: no response child frames=",
      frames,
      "location=",
      location.href,
    );
    window.parent.postMessage({ type: "AllRectsResponseComplete" }, "*");
    window.removeEventListener("message", responseCompleteHandler);
  }, 1000);
}

function handleRegisterFrame(frame) {
  if (registeredFrames.has(frame)) return;
  // console.debug("New child frame", frame, "parent-location=", location.href);
  // "frame" cannot be touched in this phase because of the cross-origin frame
  console.debug("New child frame: parent-location=", location.href);
  registeredFrames.add(frame);
}

function getBorderWidth(element, caches) {
  const rects = caches.clientRects.get(element);
  const style = caches.style.get(element);

  function f(direction, rectIndex, sizeName) {
    const propName = `border-${direction}-width`;
    if (/^0(?:\D*)$|^$/.test(style.getPropertyValue(propName))) return 0;
    const prevValue = element.style.getPropertyValue(propName);
    element.style.setProperty(propName, "0");
    const index = rectIndex === "last" ? rects.length - 1 : rectIndex;
    const w =
      rects[index][sizeName] - element.getClientRects()[index][sizeName];
    element.style.setProperty(propName, prevValue);
    return w;
  }

  return {
    top: f("top", 0, "height"),
    bottom: f("bottom", 0, "height"),
    left: f("left", 0, "width"),
    right: f("right", "last", "width"),
  };
}
