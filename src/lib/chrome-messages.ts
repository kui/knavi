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
    payload: { rect: Rect };
    response: void;
  };
}

const typeSymbol: unique symbol = Symbol("type");

type Message<T extends keyof Messages> = {
  readonly [typeSymbol]: T;
} & MessagePayload<T>;
type MessagePayload<T extends keyof Messages> = Messages[T]["payload"];
type Response<T extends keyof Messages> = Messages[T]["response"];
type Handler<T extends keyof Messages> = (
  data: MessagePayload<T>,
  sender: chrome.runtime.MessageSender,
  sendResponse: (r: Response<T>) => void,
) => void | Promise<void>;

function type<T extends keyof Messages>(m: Message<T>): T {
  return m[typeSymbol];
}

export class Router<RegisterdTypes extends keyof Messages | void> {
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

  add<T extends Exclude<keyof Messages, RegisterdTypes>>(
    type: T,
    handler: Handler<T>,
  ): Router<Exclude<RegisterdTypes | T, void>> {
    this.handlers.set(type, handler as unknown as Handler<keyof Messages>);
    return this;
  }

  addAll<T extends Exclude<keyof Messages, RegisterdTypes>>(
    types: T[],
    buildHandler: (type: T) => Handler<T>,
  ): Router<Exclude<RegisterdTypes | T, void>> {
    types.forEach((type) => this.add(type, buildHandler(type)));
    return this;
  }

  merge<T extends Exclude<keyof Messages, RegisterdTypes>>(
    router: Router<T>,
  ): Router<Exclude<RegisterdTypes | T, void>> {
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
    const handler = this.handlers.get(type(message));
    if (!handler) {
      console.debug("MessageRouter: unknown type=%s", type(message));
      return;
    }
    const result = handler(message, sender, sendResponse);
    if (result instanceof Promise) {
      result.catch(console.error);
    }
  }

  buildListener() {
    return this.route.bind(this);
  }
}

export function sendToRuntime<T extends keyof Messages>(
  type: T,
  payload: MessagePayload<T> = {},
): Promise<Response<T>> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { [typeSymbol]: type, ...payload },
      (r: Response<T>) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(r);
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
    chrome.tabs.sendMessage(
      tabId,
      { [typeSymbol]: type, ...payload },
      options,
      (r: Response<T>) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(r);
        }
      },
    );
  });
}
