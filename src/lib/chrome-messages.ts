import type { SingleLetter } from "./strings";

// TODO separate by the handler (background, content, popup, etc)
interface Messages {
  // Settings
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

  // Hint
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
  GetFrameId: {
    payload: void;
    response: number;
  };
  // Parent frame → background: register a child frame's frameId.
  // sender.frameId is the parent; childFrameId is the child.
  RegisterChildFrame: {
    payload: { childFrameId: number };
    response: void;
  };
  ExecuteAction: {
    payload: { id: ElementId; options: ActionOptions };
    response: void;
  };
  // Child frame → background: relay blur upward through frame hierarchy.
  BlurUp: {
    payload: { rect: RectJSON<"element-border", "layout-viewport"> };
    response: void;
  };
  // Background → parent/root frame: deliver blur from a child frame.
  // childFrameId === 0 means the root frame is blurring itself (no iframe transform needed).
  BlurRelay: {
    payload: {
      childFrameId: number;
      rect: RectJSON<"element-border", "layout-viewport">;
    };
    response: void;
  };
  // Root frame → background: initiate recursive rect collection.
  InitRects: {
    payload: {
      viewport: RectJSON<"actual-viewport", "root-viewport">;
      frameOffsets: CoordinatesJSON<"layout-viewport", "root-viewport">;
    };
    response: ElementRects[];
  };
  // Background → frame: collect local rects and recurse into child iframes.
  FetchRects: {
    payload: {
      viewport: RectJSON<"actual-viewport", "root-viewport">;
      frameOffsets: CoordinatesJSON<"layout-viewport", "root-viewport">;
    };
    response: ElementRects[];
  };
  // Frame → background: relay FetchRects to a registered child frame.
  RelayFetchRects: {
    payload: {
      childFrameId: number;
      viewport: RectJSON<"actual-viewport", "root-viewport">;
      frameOffsets: CoordinatesJSON<"layout-viewport", "root-viewport">;
    };
    response: ElementRects[];
  };
}

type Message<T extends keyof Messages> = {
  readonly "@type": T;
} & MessagePayload<T>;
type MessagePayload<T extends keyof Messages> = Messages[T]["payload"];
type Response<T extends keyof Messages> = Messages[T]["response"];
type Handler<T extends keyof Messages> = (
  data: MessagePayload<T>,
  sender: chrome.runtime.MessageSender,
) => Response<T> | Promise<Response<T>>;

type SendResponseArg<T extends keyof Messages> =
  | { response: Response<T> }
  | { error: Error };

function type<T extends keyof Messages>(m: Message<T>): T {
  return m["@type"];
}

function message<T extends keyof Messages>(
  type: T,
  payload: MessagePayload<T>,
): Message<T> {
  return { "@type": type, ...payload };
}

export class Router<
  // Message types which are already registered to reject duplicate type registration.
  // If T is void, it means no message types are registered.
  RegisteredTypes extends keyof Messages | void,
> {
  private readonly handlers = new Map<
    keyof Messages,
    Handler<keyof Messages>
  >();

  // Use `newInstance` instead of `new Router`, because of managing the T.
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private constructor() {}

  static newInstance(): Router<void> {
    return new Router();
  }

  add<T extends Exclude<keyof Messages, RegisteredTypes>>(
    type: T,
    handler: Handler<T>,
  ): Router<Exclude<RegisteredTypes | T, void>> {
    if (this.handlers.has(type))
      throw Error(`Already registered: type=${type}`);
    this.handlers.set(type, handler as unknown as Handler<keyof Messages>);
    return this;
  }

  addAll<T extends Exclude<keyof Messages, RegisteredTypes>>(
    types: T[],
    buildHandler: (type: T) => Handler<T>,
  ): Router<Exclude<RegisteredTypes | T, void>> {
    types.forEach((type) => this.add(type, buildHandler(type)));
    return this;
  }

  merge<T extends Exclude<keyof Messages, RegisteredTypes>>(
    router: Router<T>,
  ): Router<Exclude<RegisteredTypes | T, void>> {
    for (const [type, handler] of router.handlers) {
      this.handlers.set(type, handler);
    }
    return this;
  }

  // Returns true if the message is handled asynchronously.
  // See https://developer.chrome.com/docs/extensions/mv3/messaging/#simple.
  private route<T extends keyof Messages>(
    message: Message<T>,
    sender: chrome.runtime.MessageSender,
    sendResponse: (arg: SendResponseArg<T>) => void,
  ): boolean | void {
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

function buildErrorArg<T extends keyof Messages>(
  error: unknown,
): SendResponseArg<T> {
  console.warn(error);

  if (error instanceof Error) {
    return { error };
  } else if (typeof error === "string") {
    return { error: new Error(error) };
  } else {
    return { error: new Error(JSON.stringify(error)) };
  }
}

function unwrapResponse<T extends keyof Messages>(
  type: T,
  r: SendResponseArg<T> | undefined | null,
): Response<T> {
  if (r == null)
    throw Error(
      `No response for ${type}: receiver missing or handler not registered`,
    );
  if ("error" in r) throw r.error;
  return r.response;
}

export async function sendToRuntime<T extends keyof Messages>(
  type: T,
  ...args: MessagePayload<T> extends void ? [] : [payload: MessagePayload<T>]
): Promise<Response<T>> {
  const payload = args[0]! as MessagePayload<T>;
  const r = await chrome.runtime.sendMessage<Message<T>, SendResponseArg<T>>(
    message(type, payload),
  );
  return unwrapResponse(type, r);
}

export async function sendToTab<T extends keyof Messages>(
  tabId: number,
  type: T,
  ...args: MessagePayload<T> extends void
    ? [payload?: undefined, options?: chrome.tabs.MessageSendOptions]
    : [payload: MessagePayload<T>, options?: chrome.tabs.MessageSendOptions]
): Promise<Response<T>> {
  const payload = args[0]! as MessagePayload<T>;
  const options = args[1] ?? {};
  const r = await chrome.tabs.sendMessage<Message<T>, SendResponseArg<T>>(
    tabId,
    message(type, payload),
    options,
  );
  return unwrapResponse(type, r);
}
