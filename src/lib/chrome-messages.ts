import type { SingleLetter } from "./strings";

interface RuntimeMessages {
  // Settings — received by background
  GetSettings: {
    payload: { names: (keyof Settings)[] };
    response: Pick<Settings, keyof Settings>;
  };
  MatchBlacklist: {
    payload: { url: string };
    response: string[];
  };
  MatchAdditionalSelectors: {
    payload: { url: string };
    response: string[];
  };
  ToggleBlacklist: {
    payload: { pattern: string };
    response: { added: boolean };
  };

  // Hint session — runtime hop (content → background)
  AttachHints: {
    payload: void;
    response: void;
  };
  HitHint: {
    payload: { key: SingleLetter };
    response: void;
  };
  RemoveHints: {
    payload: { options: ActionOptions; execute: boolean };
    response: void;
  };

  // Rect / frame — received by background
  GetFrameId: {
    payload: void;
    response: number;
  };
  ExecuteAction: {
    payload: { id: ElementId; options: ActionOptions };
    response: void;
  };
  ResponseRectsFragment: {
    payload: {
      requestId: number;
      rects: ElementRects[];
    };
    response: void;
  };
  AllRectsRequest: {
    payload: {
      id: number;
      targetFrameId: number;
      viewport: RectJSON<"actual-viewport", "root-viewport">;
      offsets: CoordinatesJSON<"layout-viewport", "root-viewport">;
    };
    response: void;
  };
  BlurUp: {
    payload: {
      parentFrameId: number;
      rect: RectJSON<"element-border", "layout-viewport"> | null;
    };
    response: void;
  };
}

interface TabMessages {
  // Hint session — tab hop (background → content-root)
  AttachHintsInTab: {
    payload: void;
    response: void;
  };
  HitHintInTab: {
    payload: { key: SingleLetter };
    response: void;
  };
  RemoveHintsInTab: {
    payload: { options: ActionOptions; execute: boolean };
    response: void;
  };

  // Rect / frame — received by content
  ExecuteActionInFrame: {
    payload: { id: ElementId; options: ActionOptions };
    response: void;
  };
  ResponseRectsFragment: {
    payload: {
      requestId: number;
      rects: ElementRects[];
    };
    response: void;
  };
  AllRectsRequest: {
    payload: {
      id: number;
      targetFrameId: number;
      viewport: RectJSON<"actual-viewport", "root-viewport">;
      offsets: CoordinatesJSON<"layout-viewport", "root-viewport">;
    };
    response: void;
  };
  BlurRelay: {
    payload: {
      childFrameId: number;
      rect: RectJSON<"element-border", "layout-viewport"> | null;
    };
    response: void;
  };
  BlurRoot: {
    payload: { rect: RectJSON<"element-border", "layout-viewport"> | null };
    response: void;
  };
}

type AllMessages = RuntimeMessages & TabMessages;

type Message<T extends keyof AllMessages> = {
  readonly "@type": T;
} & MessagePayload<T>;
type MessagePayload<T extends keyof AllMessages> = AllMessages[T]["payload"];
type Response<T extends keyof AllMessages> = AllMessages[T]["response"];
type Handler<T extends keyof AllMessages> = (
  data: MessagePayload<T>,
  sender: chrome.runtime.MessageSender,
) => Response<T> | Promise<Response<T>>;

// A passive handler observes a message without sending a response.
// Use addPassive() when another listener in a different script owns the
// sendResponse for the same message type.
type PassiveHandler<T extends keyof AllMessages> = (
  data: MessagePayload<T>,
  sender: chrome.runtime.MessageSender,
) => void | Promise<void>;

type SendResponseArg<T extends keyof AllMessages> =
  | { response: Response<T> }
  | { error: Error };

function type<T extends keyof AllMessages>(m: Message<T>): T {
  return m["@type"];
}

function message<T extends keyof AllMessages>(
  type: T,
  payload: MessagePayload<T>,
): Message<T> {
  return { "@type": type, ...payload };
}

export class Router<
  // Message types which are already registered to reject duplicate type registration.
  // If T is void, it means no message types are registered.
  RegisteredTypes extends keyof AllMessages | void,
> {
  private readonly handlers = new Map<
    keyof AllMessages,
    Handler<keyof AllMessages>
  >();
  private readonly passiveHandlers = new Map<
    keyof AllMessages,
    PassiveHandler<keyof AllMessages>
  >();

  // Use `newInstance` instead of `new Router`, because of managing the T.
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private constructor() {}

  static newInstance(): Router<void> {
    return new Router();
  }

  private isRegistered(type: keyof AllMessages): boolean {
    return this.handlers.has(type) || this.passiveHandlers.has(type);
  }

  add<T extends Exclude<keyof AllMessages, RegisteredTypes>>(
    type: T,
    handler: Handler<T>,
  ): Router<Exclude<RegisteredTypes | T, void>> {
    if (this.isRegistered(type))
      throw Error(`Already registered: type=${type}`);
    this.handlers.set(type, handler as unknown as Handler<keyof AllMessages>);
    return this;
  }

  // Register a passive handler: observes the message without sending a
  // response. Use when another listener in a different script (e.g.
  // content-root.ts) owns the sendResponse for this message type.
  addPassive<T extends Exclude<keyof AllMessages, RegisteredTypes>>(
    type: T,
    handler: PassiveHandler<T>,
  ): Router<Exclude<RegisteredTypes | T, void>> {
    if (this.isRegistered(type))
      throw Error(`Already registered: type=${type}`);
    this.passiveHandlers.set(
      type,
      handler as unknown as PassiveHandler<keyof AllMessages>,
    );
    return this;
  }

  addAll<T extends Exclude<keyof AllMessages, RegisteredTypes>>(
    types: T[],
    buildHandler: (type: T) => Handler<T>,
  ): Router<Exclude<RegisteredTypes | T, void>> {
    types.forEach((type) => this.add(type, buildHandler(type)));
    return this;
  }

  merge<T extends Exclude<keyof AllMessages, RegisteredTypes>>(
    router: Router<T>,
  ): Router<Exclude<RegisteredTypes | T, void>> {
    for (const [type, handler] of router.handlers) {
      this.handlers.set(type, handler);
    }
    for (const [type, handler] of router.passiveHandlers) {
      this.passiveHandlers.set(type, handler);
    }
    return this;
  }

  // Returns true if the message is handled asynchronously.
  // See https://developer.chrome.com/docs/extensions/mv3/messaging/#simple.
  private route<T extends keyof AllMessages>(
    message: Message<T>,
    sender: chrome.runtime.MessageSender,
    sendResponse: (arg: SendResponseArg<T>) => void,
  ): boolean | void {
    const passiveHandler = this.passiveHandlers.get(type(message));
    if (passiveHandler) {
      console.debug("Recieve (passive): ", message);
      try {
        const result = passiveHandler(message, sender);
        if (result instanceof Promise) {
          result.catch((e) => console.warn("Passive handler error:", e));
        }
      } catch (e) {
        console.warn("Passive handler error:", e);
      }
      return; // Do not call sendResponse; the active listener owns the response.
    }

    const handler = this.handlers.get(type(message));
    if (!handler) return;

    console.debug("Recieve: ", message);
    console.debug("Handle: ", handler);

    let response: Response<T> | Promise<Response<T>> | undefined;
    let error;
    try {
      response = handler(message, sender);
    } catch (e) {
      error = e;
    }

    if (response instanceof Promise) {
      response
        .then((r) => sendResponse({ response: r }))
        .catch((e) => sendResponse(buildErrorArg(e)));
      return true;
    } else if (error) {
      sendResponse(buildErrorArg(error));
    } else {
      sendResponse({ response });
    }
  }

  buildListener() {
    return this.route.bind(this);
  }
}

function buildErrorArg<T extends keyof AllMessages>(
  error: unknown,
): SendResponseArg<T> {
  if (error instanceof Error) {
    return { error };
  } else if (typeof error === "string") {
    return { error: new Error(error) };
  } else {
    return { error: new Error(JSON.stringify(error)) };
  }
}

export async function sendToRuntime<T extends keyof RuntimeMessages>(
  type: T,
  payload: RuntimeMessages[T]["payload"],
): Promise<RuntimeMessages[T]["response"]> {
  const r = await chrome.runtime.sendMessage<Message<T>, SendResponseArg<T>>(
    message(type, payload),
  );
  if (r == null)
    throw Error(
      `No response for ${type}: receiver missing or handler not registered`,
    );
  if ("error" in r) throw r.error;
  return r.response;
}

export async function sendToTab<T extends keyof TabMessages>(
  tabId: number,
  type: T,
  payload: TabMessages[T]["payload"],
  options: chrome.tabs.MessageSendOptions = {},
): Promise<TabMessages[T]["response"]> {
  const r = await chrome.tabs.sendMessage<Message<T>, SendResponseArg<T>>(
    tabId,
    message(type, payload),
    options,
  );
  if (r == null)
    throw Error(
      `No response for ${type}: receiver missing or handler not registered`,
    );
  if ("error" in r) throw r.error;
  return r.response;
}
