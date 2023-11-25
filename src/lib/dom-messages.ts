import { printError } from "./errors";

interface MessageDefinition {
  "com.github.kui.knavi.AllRectsRequest": {
    payload: {
      // Target visual viewport relative to the root visual viewport.
      viewport: Rect;
      // Coordinates of Target frame relative to the root visual viewport.
      offsets: Coordinates;
    };
  };
  "com.github.kui.knavi.Blur": {
    payload: {
      // The rect is relative to the visual viewport.
      // if the rect is null, it means the target is out of the visual viewport.
      rect: Rect | null;
    };
  };
}

export type MessageTypes = keyof MessageDefinition;

export type MessagePayload<T extends MessageTypes> =
  MessageDefinition[T]["payload"];

export interface BaseMessage {
  "@type": MessageTypes;
}

export type Message<T extends MessageTypes> = BaseMessage & MessagePayload<T>;

export class Router {
  private readonly handlers: Map<
    string,
    ((event: MessageEvent) => void | Promise<void>)[]
  >;

  constructor() {
    this.handlers = new Map();
  }

  add<T extends MessageTypes>(
    type: T,
    handler: (e: MessageEvent<MessagePayload<T>>) => void | Promise<void>,
  ): Router {
    const handlers = this.handlers.get(type) ?? [];
    handlers.push(handler);
    this.handlers.set(type, handlers);
    return this;
  }

  private handleMessage(event: MessageEvent<BaseMessage>) {
    console.debug("Received: ", event);
    const handlers = this.handlers.get(event.data["@type"]);
    if (!handlers) {
      return;
    }

    console.debug("Handlers: ", handlers);
    for (const h of handlers) {
      let result;
      try {
        result = h(event);
      } catch (e) {
        console.error(e);
      }
      if (result instanceof Promise) {
        result.catch(printError);
      }
    }
  }

  buildListener() {
    return this.handleMessage.bind(this);
  }
}

export function postMessageTo<T extends MessageTypes>(
  to: Window,
  type: T,
  payload: MessagePayload<T>,
) {
  to.postMessage({ "@type": type, ...payload }, "*");
}
