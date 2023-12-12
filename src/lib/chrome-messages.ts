import { SingleLetter } from "./strings";

declare global {
  // eslint-disable-next-line no-var
  var knaviChromeMessageId: number;
  // eslint-disable-next-line no-var
  var knaviChromeMessageErrorId: number;
}

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
    payload: { options: ActionOptions };
    response: void;
  };
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
  | {
      response: Response<T>;
    }
  | {
      error: {
        id: number;
        message?: string;
        stack?: string;
      };
    };

function type<T extends keyof Messages>(m: Message<T>): T {
  return m["@type"];
}

function message<T extends keyof Messages>(
  type: T,
  payload: MessagePayload<T>,
): Message<T> {
  return { "@type": type, ...payload };
}

if (!globalThis.knaviChromeMessageErrorId)
  globalThis.knaviChromeMessageErrorId = 0;

function nextMessageErrorId(): number {
  return globalThis.knaviChromeMessageErrorId++;
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
    }

    if (error) {
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
  const id = nextMessageErrorId();
  console.error("id=%s", id, error);

  const arg: SendResponseArg<T> = { error: { id } };
  if (error instanceof Error) {
    arg.error.message = error.message;
    arg.error.stack = error.stack;
  } else {
    arg.error.message = String(error);
  }
  return arg;
}

if (!globalThis.knaviChromeMessageId) globalThis.knaviChromeMessageId = 0;

function nextMessageId(): number {
  return globalThis.knaviChromeMessageId++;
}

export function sendToRuntime<T extends keyof Messages>(
  type: T,
  payload: MessagePayload<T>,
): Promise<Response<T>> {
  return new Promise((resolve, reject) => {
    const requestId = nextMessageId();
    console.debug("sendToRuntime(id=%s): ", requestId, type, payload);
    console.time(`sendToRuntime(id=${requestId})`);
    let done = false;
    chrome.runtime.sendMessage(
      message(type, payload),
      (arg: SendResponseArg<T> | undefined) => {
        if (done) {
          console.warn("sendToRuntime(id=%s) already done: ", requestId, arg);
          return;
        }
        done = true;
        console.debug("sendToRuntime(id=%s) response: ", requestId, arg);
        console.timeEnd(`sendToRuntime(id=${requestId})`);
        if (!arg || "error" in arg) {
          const cause = arg ? arg.error : chrome.runtime.lastError;
          reject(Error(`Failed to sendToRuntime: type=${type}`, { cause }));
        } else {
          resolve(arg.response);
        }
      },
    );
  });
}

export function sendToTab<T extends keyof Messages>(
  tabId: number,
  type: T,
  payload: MessagePayload<T>,
  options: chrome.tabs.MessageSendOptions = {},
): Promise<Response<T>> {
  return new Promise((resolve, reject) => {
    const requestId = nextMessageId();
    console.debug("sendToTab(id=%s): ", requestId, type, payload);
    console.time(`sendToTab(id=${requestId})`);
    let done = false;
    chrome.tabs.sendMessage(
      tabId,
      message(type, payload),
      options,
      (arg: SendResponseArg<T> | undefined) => {
        if (done) {
          console.warn("sendToTab(id=%d) already done: ", requestId, arg);
          return;
        }
        done = true;
        console.debug("sendToTab(id=%d) response: ", requestId, arg);
        console.timeEnd(`sendToTab(id=${requestId})`);
        if (!arg || "error" in arg) {
          const cause = arg ? arg.error : chrome.runtime.lastError;
          const values = [
            `tabId=${tabId}`,
            `type=${type}`,
            `options=${JSON.stringify(options)}`,
          ].join(", ");
          reject(Error(`Failed to sendToTab: ${values}`, { cause }));
        } else {
          resolve(arg.response);
        }
      },
    );
  });
}
