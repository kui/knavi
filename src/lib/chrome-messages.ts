import type { SingleLetter } from "./strings";

/**
 * Assigned by content-root when it accepts a hint session. Taken from the
 * clock, so it also increases across top-frame documents of a tab, as long
 * as the wall clock does not step backwards.
 */
export type SessionId = number;

export interface RuntimeMessages {
  GetSettings: {
    payload: { names: (keyof Settings)[] };
    response: Pick<Settings, keyof Settings>;
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
    /** Answered as soon as content-root accepts the session, not when it ends. */
    response: { sessionId: SessionId };
  };
  HitHint: {
    payload: { sessionId: SessionId; key: SingleLetter };
    response: void;
  };
  CycleHint: {
    payload: { sessionId: SessionId };
    response: void;
  };
  RemoveHints: {
    payload: { sessionId: SessionId; options: ActionOptions; execute: boolean };
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
      /** The hint session's id; frames pass it on to their child frames. */
      id: SessionId;
      targetPath: string[];
      viewport: RectJSON<"actual-viewport", "root-viewport">;
      offsets: CoordinatesJSON<"layout-viewport", "root-viewport">;
    };
    response: void;
  };
  ReportFramePath: {
    payload: { path: string[] };
    response: void;
  };
  BlurUp: {
    payload: {
      path: string[];
      rect: RectJSON<"element-border", "layout-viewport"> | null;
    };
    response: void;
  };
}

export interface TabMessages {
  AttachHintsInTab: {
    payload: void;
    response: { sessionId: SessionId };
  };
  HitHintInTab: {
    payload: { sessionId: SessionId; key: SingleLetter };
    response: void;
  };
  CycleHintInTab: {
    payload: { sessionId: SessionId };
    response: void;
  };
  /**
   * Answers without awaiting whether `sessionId` is the live session, and if
   * so stops its input until RemoveHintsInTab ends it.
   */
  BeginRemoveHintsInTab: {
    payload: { sessionId: SessionId };
    response: boolean;
  };
  RemoveHintsInTab: {
    payload: { sessionId: SessionId; options: ActionOptions; execute: boolean };
    response: void;
  };
  /**
   * Broadcast to every frame (no frameId filter) when a session starts or is
   * asked to end, so each frame's KeyboardHandler routes keystrokes correctly
   * even when focus sits in a frame that did not initiate the session (#120).
   * Kept separate from AttachHintsInTab/RemoveHintsInTab on purpose: those
   * are 1:1 RPCs to the session-owning root frame, and frames eavesdropping
   * on them cannot observe the response.
   * Broadcasts are not ordered against each other or against the replies to
   * AttachHints, so frames drop one whose sessionId is older than the latest
   * they have seen.
   * INVARIANT: dispatch true as soon as content-root accepts the session and
   * false as soon as BeginRemoveHintsInTab confirms that RemoveHints is for
   * the live session, before RemoveHintsInTab runs the action, not after the
   * RPC settles: by then the next session's keystrokes can already be in
   * flight. A RemoveHints of an ended session broadcasts nothing.
   */
  SyncHintingState: {
    payload: { active: boolean; sessionId: SessionId };
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
      /** The hint session's id; frames pass it on to their child frames. */
      id: SessionId;
      targetPath: string[];
      viewport: RectJSON<"actual-viewport", "root-viewport">;
      offsets: CoordinatesJSON<"layout-viewport", "root-viewport">;
    };
    response: void;
  };
  BlurRelay: {
    payload: {
      targetPath: string[];
      childSegment: string;
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
