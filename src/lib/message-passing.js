// @flow

type MessageType = string;

interface Message<T: MessageType> {
  type: T;
}

type RecieveHandler<T: MessageType, M: Message<T>> =
  (message: M, sender: ChromeMessageSender, sendResponse: (a: any) => any) => any;
type SubscribeHandler<T: MessageType, M: Message<T>> =
  (message: M, sender: ChromeMessageSender) => any;
type InternalMessageHandler<T: MessageType, M: Message<T>> =
  (message: M, sender: ChromeMessageSender, sendResponse: (a: any) => any) => boolean;
type HandlerContainer<T: MessageType, M: Message<T>> = {
  type: T,
  handlerType: "subscribers" | "reciever",
  handlers: InternalMessageHandler<T, M>[],
};
let handlers: Map<MessageType, HandlerContainer<any, any>>;

function initIfRequired() {
  if (handlers) return;
  console.debug("init message passing manager");
  handlers = new Map;
  chrome.runtime.onMessage.addListener((message: Message<any>, sender, sendResponse) => {
    const c = handlers.get(message.type);
    if (!c || c.handlers.length === 0) return;
    return c.handlers.some((h) => h(message, sender, sendResponse));
  });
}

export function sendTo<T: MessageType, M: Message<T>>(message: M, tabId: number, frameId?: ?number, responseCallback?: (a: any) => void): void {
  chrome.tabs.sendMessage(tabId, message, frameId ? { frameId } : null, responseCallback);
}
export function send<T: MessageType, M: Message<T>>(message: M, responseCallback?: (a: any) => void): void {
  chrome.runtime.sendMessage(message, responseCallback);
}

type Unsubscriber = () => void;

export function recieve<T: MessageType, M: Message<T>>(type: T, handler: RecieveHandler<T, M>): Unsubscriber {
  initIfRequired();
  if (handlers.has(type)) {
    throw Error("Already register a recievie-handler: type=" + type);
  }
  handlers.set(type, {
    type,
    handlerType: "reciever",
    handlers: [(m: M, s, r) => {
      handler(m, s, r);
      return true;
    }],
  });
  return () => {
    handlers.delete(type);
  };
}

export function subscribe<T: MessageType, M: Message<T>>(type: T, handler: SubscribeHandler<T, M>): Unsubscriber {
  initIfRequired();

  const c = handlers.get(type) || {
    type,
    handlerType: "subscribers",
    handlers: [],
  };
  handlers.set(type, c);
  if (c.handlerType === "reciever") {
    throw Error("Already register a recievie-handler: type=" + type);
  }

  const h = (m: M, s) => {
    handler(m, s);
    return false;
  };
  c.handlers.push(h);

  return () => {
    const idx = c.handlers.indexOf(h);
    if (idx < 0) {
      console.warn("Already unsubscribed: type=", type);
    } else {
      c.handlers.splice(idx, 1);
    }
  };
}
