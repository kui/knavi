import { send, recieve } from "./chrome-messages.js";
import * as vp from "./viewports.js";
import * as rectUtils from "./rects.js";

const ALL_RECTS_REQUEST_TYPE = "jp-k-ui-knavi-AllRectsRequest";

const frameIdPromise = send({ type: "GetFrameId" }).then(id => {
  if (id !== 0) throw Error(`This script might not work right: frameId=${id}`);
  return id;
});

/// fetch all rects include elements inside iframe.
/// Requests are thrown by `postMessage` (frame message passing),
/// because the requests should reach only visible frames.
export function fetchAllRects(callback) {
  return new Promise(resolve => {
    let completeHandler;
    const stopRecieve = recieve(
      "RectsFragmentResponse",
      (res, sender, done) => {
        console.debug("RectsFragmentResponse", res);
        callback(res.holders);
        done();
      }
    );

    window.addEventListener(
      "message",
      (completeHandler = event => {
        if (event.source !== window) return;
        if (event.data.type !== "AllRectsResponseComplete") return;
        window.removeEventListener("message", completeHandler);
        stopRecieve();
        resolve();
      })
    );

    const offsets = { x: 0, y: 0 };
    const visualVpSizes = vp.visual.sizes();

    (async () => {
      window.postMessage(
        {
          type: ALL_RECTS_REQUEST_TYPE,
          offsets,
          viewport: rectUtils.rectByOffsetsAndSizes(offsets, visualVpSizes),
          clientFrameId: await frameIdPromise
        },
        "*"
      );
    })();
  });
}

export function getDescriptions(e) {
  return send({
    type: "DescriptionsRequest",
    frameId: e.frameId,
    index: e.index
  });
}

export function action(e, options) {
  return send({
    type: "ActionRequest",
    frameId: e.frameId,
    index: e.index,
    options
  });
}
