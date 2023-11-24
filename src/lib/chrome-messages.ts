import { printError } from "./errors";
import { SingleLetter } from "./strings";

// TODO separate by the handler (background, content, popup, etc)
interface Messages {
  // Settings
  GetSettings: {
    payload: { names?: (keyof Settings)[] };
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
  BroadcastNewSettings: {
    payload: Settings;
    response: void;
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
  GetDescriptions: {
    payload: { frameId: number; index: number };
    response: ActionDescriptions;
  };
  ExecuteAction: {
    payload: { frameId: number; index: number; options: ActionOptions };
    response: void;
  };
  ResponseRectsFragment: {
    payload: {
      holders: RectHolder[];
      clientFrameId: number;
    };
    response: void;
  };

  // HintView
  RenderTargets: {
    payload: { targets: HintTarget[] };
    response: void;
  };
  AfterHitHint: {
    payload: {
      input: SingleLetter;
      // Targets whose state is changed.
      changes: HintTarget[];
      actionDescriptions: ActionDescriptions | null;
    };
    response: void;
  };
  AfterRemoveHints: {
    payload: void;
    response: void;
  };

  // Blur
  AfterBlur: {
    payload: { rect: Rect | null };
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
  sendResponse: (r: Response<T>) => void,
) => void | Promise<void>;

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

  private route<T extends keyof Messages>(
    message: Message<T>,
    sender: chrome.runtime.MessageSender,
    sendResponse: (r: Response<T>) => void,
  ) {
    console.debug("Recieve: ", message);
    const handler = this.handlers.get(type(message));
    if (!handler) {
      console.debug("No hundler: ", message);
      return;
    }
    console.debug("Handle: ", handler);
    const result = handler(message, sender, sendResponse);
    if (result instanceof Promise) {
      result.catch(printError);
    }
  }

  buildListener() {
    return this.route.bind(this);
  }
}

const messageIdGenerator = (function* (): Generator<number, number> {
  let i = 0;
  while (true) yield i++;
})();

function nextMessageId(): number {
  return messageIdGenerator.next().value;
}

export function sendToRuntime<T extends keyof Messages>(
  type: T,
  payload: MessagePayload<T> = {},
): Promise<Response<T>> {
  return new Promise((resolve, reject) => {
    const requestId = nextMessageId();
    console.debug("sendToRuntime(id=%d): ", requestId, type, payload);
    chrome.runtime.sendMessage(message(type, payload), (r: Response<T>) => {
      console.debug("sendToRuntime(id=%d) response: ", requestId, r);
      const cause = chrome.runtime.lastError;
      if (cause) {
        reject(Error(`Failed to sendToRuntime: type=${type}`, { cause }));
      } else {
        resolve(r);
      }
    });
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
    console.debug("sendToTab(id=%d): ", requestId, type, payload);
    chrome.tabs.sendMessage(
      tabId,
      message(type, payload),
      options,
      (r: Response<T>) => {
        console.debug("sendToTab(id=%d) response: ", requestId, r);
        const cause = chrome.runtime.lastError;
        if (cause) {
          const values = [
            `tabId=${tabId}`,
            `type=${type}`,
            `options=${JSON.stringify(options)}`,
          ].join(", ");
          reject(Error(`Failed to sendToTab: ${values}`, { cause }));
        } else {
          resolve(r);
        }
      },
    );
  });
}
