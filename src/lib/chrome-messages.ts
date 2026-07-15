import type { SingleLetter } from "./strings";

export interface RuntimeMessages {
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

  AttachHints: {
    payload: void;
    response: void;
  };
  HitHint: {
    payload: { key: SingleLetter };
    response: void;
  };
  CycleHint: {
    payload: void;
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
  AttachHintsInTab: {
    payload: void;
    response: void;
  };
  HitHintInTab: {
    payload: { key: SingleLetter };
    response: void;
  };
  CycleHintInTab: {
    payload: void;
    response: void;
  };
  RemoveHintsInTab: {
    payload: { options: ActionOptions; execute: boolean };
    response: void;
  };
  /**
   * Broadcast to every frame (no frameId filter) when the background
   * forwards AttachHints/RemoveHints, so each frame's KeyboardHandler routes
   * keystrokes correctly even when focus sits in a frame that did not
   * initiate the session (#120).
   * Kept separate from AttachHintsInTab/RemoveHintsInTab on purpose: those
   * are 1:1 RPCs to the session-owning root frame, and frames eavesdropping
   * on them cannot observe the response, so a failed attach would strand
   * them at hinting=true and handleKeypress would swallow every keystroke.
   * A dedicated message lets the background compensate with {active:false}
   * when the attach fails.
   * INVARIANT: dispatch at request time, not after the RPC settles.
   * AttachHintsInTab resolves only after rect streaming and RemoveHintsInTab
   * only after the action executes; by then the next session's keystrokes
   * can already be in flight and a late sync would clobber the newer flag.
   */
  SyncHintingState: {
    payload: { active: boolean };
    response: void;
  };

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

// WHY: use conditional inference so M can be a concrete interface (no index signature needed).
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

type MSendResponseArg<M, T extends keyof M> =
  | { response: MResponse<M, T> }
  | { error: Error };

// WHY: Object.assign avoids TypeScript's spread-of-void complaint.
function makeMessage<M, T extends keyof M>(
  type: T,
  payload: MPayload<M, T>,
): MMessage<M, T> {
  return Object.assign({ "@type": type }, payload);
}

export class Router<
  M,
  // WHY: message types already registered; void means none registered yet.
  RegisteredTypes extends keyof M | void,
> {
  private readonly handlers = new Map<keyof M, MHandler<M, keyof M>>();

  // WHY: use the static factories instead of `new Router`.
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private constructor() {}

  static newRuntimeInstance(): Router<RuntimeMessages, void> {
    return new Router();
  }

  static newTabInstance(): Router<TabMessages, void> {
    return new Router();
  }

  add<T extends Exclude<keyof M, RegisteredTypes>>(
    type: T,
    handler: MHandler<M, T>,
  ): Router<M, Exclude<RegisteredTypes | T, void>> {
    if (this.handlers.has(type))
      throw Error(`Already registered: type=${String(type)}`);
    this.handlers.set(type, handler);
    return this;
  }

  // WHY: M is fixed on the router, so merge only accepts routers of the same channel.
  merge<T extends Exclude<keyof M, RegisteredTypes>>(
    router: Router<M, T>,
  ): Router<M, Exclude<RegisteredTypes | T, void>> {
    for (const [type, handler] of router.handlers) {
      this.handlers.set(type, handler);
    }
    return this;
  }

  /**
   * Returns true if the message is handled asynchronously.
   * See https://developer.chrome.com/docs/extensions/mv3/messaging/#simple.
   */
  private route<T extends keyof M>(
    message: MMessage<M, T>,
    sender: chrome.runtime.MessageSender,
    sendResponse: (arg: MSendResponseArg<M, T>) => void,
  ): boolean | void {
    const msgType = (message as { "@type": keyof M })["@type"];

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
