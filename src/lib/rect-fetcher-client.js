// @flow

import { send, recieve } from "./chrome-messages";
import * as vp from "./viewports";
import * as rectUtils from "./rects";

import type { RectsFragmentResponse } from "./rect-fetcher-service";
import type { ActionOptions } from "./action-handlers";
import type { Rect } from "./rects";

export interface Element {
  frameId: number;
  index: number;
}

export interface RectHolder extends Element {
  rects: Rect[];
}

export interface Descriptions {
  short: string,
  long: ?string,
}

const ALL_RECTS_REQUEST_TYPE = "jp-k-ui-knavi-AllRectsRequest";
export type AllRectsRequest = {
  type: "jp-k-ui-knavi-AllRectsRequest";
  /// Visual viewport offset in a child frame from the visual viewport of the root frame.
  offsets: { x: number, y: number };
  /// Actual viewport rect in a child frame.
  viewport: Rect;
  clientFrameId: number;
}

export type DescriptionsRequest = {
  type: "DescriptionsRequest";
  frameId: number;
  index: number;
}

export type ActionRequest = {
  type: "ActionRequest";
  frameId: number;
  index: number;
  options: ActionOptions;
}

export type Callback = (holdersFragment: RectHolder[]) => void;

export type GetFrameId = { type: "GetFrameId"; };

const frameIdPromise = send(({ type: "GetFrameId" }: GetFrameId)).then((id: number) => {
  if (id !== 0) throw Error(`This script might not work right: frameId=${id}`);
  return id;
});

/// fetch all rects include elements inside iframe.
/// Requests are thrown by `postMessage` (frame message passing),
/// because the requests should reach only visible frames.
export function fetchAllRects(callback: Callback): Promise<void> {
  return new Promise((resolve) => {
    let completeHandler;
    const stopRecieve = recieve(
      "RectsFragmentResponse",
      (res: RectsFragmentResponse, sender, done) => {
        console.debug("RectsFragmentResponse", res);
        callback(res.holders);
        done();
      }
    );

    window.addEventListener("message", completeHandler = (event) => {
      if (event.source !== window) return;
      if (event.data.type !== "AllRectsResponseComplete") return;
      window.removeEventListener("message", completeHandler);
      stopRecieve();
      resolve();
    });

    const offsets = { x: 0, y: 0 };
    const visualVpSizes = vp.visual.sizes();

    (async () => {
      window.postMessage(({
        type: ALL_RECTS_REQUEST_TYPE,
        offsets,
        viewport: rectUtils.rectByOffsetsAndSizes(offsets, visualVpSizes),
        clientFrameId: await frameIdPromise,
      }: AllRectsRequest), "*");
    })();
  });
}

export function getDescriptions(e: Element): Promise<Descriptions> {
  return send(({
    type: "DescriptionsRequest",
    frameId: e.frameId,
    index: e.index
  }: DescriptionsRequest));
}

export function action(e: Element, options: ActionOptions): Promise<void> {
  return send(({
    type: "ActionRequest",
    frameId: e.frameId,
    index: e.index,
    options,
  }: ActionRequest));
}
