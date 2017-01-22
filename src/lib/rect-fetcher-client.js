// @flow

import type { RectsFragmentResponse } from "./rect-fetcher-service";
import type { ActionOptions } from "./action-handlers";

export interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

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

export type AllRectsRequest = {
  type: "AllRectsRequest";
  offsetX: number;
  offsetY: number;
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

export type Callback = (holdersFragment: RectHolder[]) => void

chrome.runtime.sendMessage("getFrameId", (id) => {
  if (id !== 0) throw Error(`This script might not work right: frameId=${id}`);
});

/// fetch all rects include elements inside iframe.
/// Requests are thrown by `postMessage` (frame message passing),
/// because the requests should reach only visible frames.
export function fetchAllRects(callback: Callback): Promise<void> {
  return new Promise((resolve) => {
    let callbackHandler;
    let completeHandler;
    chrome.runtime.onMessage.addListener(callbackHandler = (message, sender, done) => {
      if (message.type !== "RectsFragmentResponse") return;
      console.debug("RectsFragmentResponse", message);
      const r: RectsFragmentResponse = message;
      callback(r.holders);
      done();
      return true;
    });
    window.addEventListener("message", completeHandler = (event) => {
      if (event.source !== window) return;
      if (event.data.type !== "AllRectsResponseComplete") return;
      chrome.runtime.onMessage.removeListener(callbackHandler);
      window.removeEventListener("message", completeHandler);
      resolve();
    });
    window.postMessage(({
      type: "AllRectsRequest",
      offsetX: 0,
      offsetY: 0,
    }: AllRectsRequest), "*");
  });
}

export function getDescriptions(arg: Element): Promise<Descriptions> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      ({
        type: "DescriptionsRequest",
        frameId: arg.frameId,
        index: arg.index
      }: DescriptionsRequest),
      null,
      resolve,
    );
  });
}

export function action(arg: Element, options: ActionOptions): Promise<void> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(({
      type: "ActionRequest",
      frameId: arg.frameId,
      index: arg.index,
      options,
    }: ActionRequest), null, resolve);
  });
}
