// @flow

import { EventEmitter } from "./event-emitter";

/// a message from a child frame indicates to blur.
const BLUR_MESSAGE = "jp-k-ui-knavi-blur";

export default class Blurer {
  onBlured: EventEmitter<HTMLElement>;
  messageHandler: (e: MessageEvent) => void;

  constructor() {
    this.onBlured = new EventEmitter;

    // Blur request from a child frame
    window.addEventListener("message", this.messageHandler = (e) => {
      if (e.data === BLUR_MESSAGE) this.blur();
    });
  }

  destruct() {
    window.removeEventListener("message", this.messageHandler);
  }

  blur(): boolean {
    if (isBlurable()) {
      console.debug("blur", document.activeElement);
      this.onBlured.emit(document.activeElement);
      document.activeElement.blur();
      return true;
    } else if (isInFrame()) {
      console.debug("blur form the current frame", window.document.body);
      window.parent.postMessage(BLUR_MESSAGE, "*");
      return true;
    }
    return false;
  }
}

function isBlurable() {
  return document.activeElement !== document.body;
}

function isInFrame() {
  return window.parent !== window;
}

