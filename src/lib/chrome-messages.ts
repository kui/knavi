import type { SingleLetter } from "./strings";

export interface RuntimeMessages {
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

export interface TabMessages {
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

// Use conditional inference so M can be a concrete interface (no index signature needed).
type MPayload<M, T extends keyof M> = M[T] extends { payload: infer P }
  ? P
  : never;
type MResponse<M, T extends keyof M> = M[T] extends { response: infer R }
  ? R
  : never;
type MMessage<M, T extends keyof M> = { readonly "@type": T } & MPayload<M, T>;

type MHandler<M, T extends keyof M> = (
  data: MPayload<M, T>,
  sender: chrome.runtime.MessageSender,
) => MResponse<M, T> | Promise<MResponse<M, T>>;

// A passive handler observes a message without sending a response.
// Use addPassive() when another listener in a different script owns the
// sendResponse for the same message type.
type MPassiveHandler<M, T extends keyof M> = (
  data: MPayload<M, T>,
  sender: chrome.runtime.MessageSender,
) => void | Promise<void>;

type MSendResponseArg<M, T extends keyof M> =
  | { response: MResponse<M, T> }
  | { error: Error };

// Object.assign avoids TypeScript's spread-of-void complaint.
function makeMessage<M, T extends keyof M>(
  type: T,
  payload: MPayload<M, T>,
): MMessage<M, T> {
  return Object.assign({ "@type": type }, payload);
}

export class Router<
  M,
  // Message types already registered; void means none registered yet.
  RegisteredTypes extends keyof M | void,
> {
  private readonly handlers = new Map<keyof M, MHandler<M, keyof M>>();
  private readonly passiveHandlers = new Map<
    keyof M,
    MPassiveHandler<M, keyof M>
  >();

  // Use the static factories instead of `new Router`.
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private constructor() {}

  static newRuntimeInstance(): Router<RuntimeMessages, void> {
    return new Router();
  }

  static newTabInstance(): Router<TabMessages, void> {
    return new Router();
  }

  private isRegistered(type: keyof M): boolean {
    return this.handlers.has(type) || this.passiveHandlers.has(type);
  }

  add<T extends Exclude<keyof M, RegisteredTypes>>(
    type: T,
    handler: MHandler<M, T>,
  ): Router<M, Exclude<RegisteredTypes | T, void>> {
    if (this.isRegistered(type))
      throw Error(`Already registered: type=${String(type)}`);
    this.handlers.set(type, handler);
    return this;
  }

  // Register a passive handler: observes the message without sending a
  // response. Use when another listener in a different script (e.g.
  // content-root.ts) owns the sendResponse for this message type.
  addPassive<T extends Exclude<keyof M, RegisteredTypes>>(
    type: T,
    handler: MPassiveHandler<M, T>,
  ): Router<M, Exclude<RegisteredTypes | T, void>> {
    if (this.isRegistered(type))
      throw Error(`Already registered: type=${String(type)}`);
    this.passiveHandlers.set(type, handler);
    return this;
  }

  // M is fixed on the router, so merge only accepts routers of the same channel.
  merge<T extends Exclude<keyof M, RegisteredTypes>>(
    router: Router<M, T>,
  ): Router<M, Exclude<RegisteredTypes | T, void>> {
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
  private route<T extends keyof M>(
    message: MMessage<M, T>,
    sender: chrome.runtime.MessageSender,
    sendResponse: (arg: MSendResponseArg<M, T>) => void,
  ): boolean | void {
    const msgType = (message as { "@type": keyof M })["@type"];

    const passiveHandler = this.passiveHandlers.get(msgType);
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

    const handler = this.handlers.get(msgType);
    if (!handler) return;

    console.debug("Recieve: ", message);
    console.debug("Handle: ", handler);

    let response: MResponse<M, T> | Promise<MResponse<M, T>> | undefined;
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
      sendResponse({ response: response! });
    }
  }

  buildListener() {
    return this.route.bind(this);
  }
}

function buildErrorArg(error: unknown): { error: Error } {
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
  payload: MPayload<RuntimeMessages, T>,
): Promise<MResponse<RuntimeMessages, T>> {
  const msg = makeMessage<RuntimeMessages, T>(type, payload);
  const r = await chrome.runtime.sendMessage<
    typeof msg,
    { response: MResponse<RuntimeMessages, T> } | { error: Error }
  >(msg);
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
  payload: MPayload<TabMessages, T>,
  options: chrome.tabs.MessageSendOptions = {},
): Promise<MResponse<TabMessages, T>> {
  const msg = makeMessage<TabMessages, T>(type, payload);
  const r = await chrome.tabs.sendMessage<
    typeof msg,
    { response: MResponse<TabMessages, T> } | { error: Error }
  >(tabId, msg, options);
  if (r == null)
    throw Error(
      `No response for ${type}: receiver missing or handler not registered`,
    );
  if ("error" in r) throw r.error;
  return r.response;
}
