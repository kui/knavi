import { RectAggregatorContentAll as RectAggregator } from "./content-all/rect-aggregator";
import { KeyboardHandlerContentAll as KeyboardHandler } from "./content-all/keyboard-handler";
import { BlurerContentAll as Blurer } from "./content-all/blurer";
import settingsClient from "./lib/settings-client";
import { printError } from "./lib/errors";
import { wait } from "./lib/promises";
import BlurerClient from "./content-all/blurer-client";
import HinterClient from "./lib/hinter-client";
import {
  Router as ChromeMessageRouter,
  sendToRuntime,
} from "./lib/chrome-messages";
import { Coordinates, Rect } from "./dom/rects";
import {
  announceFrameIdToParent,
  onChildFrameId,
} from "./dom/frame-registration";
import { filter, first } from "./lib/iters";

globalThis.KNAVI_FILE = "content-all";

const iframeByFrameId = new Map<number, HTMLIFrameElement>();
const iframeToFrameId = new Map<HTMLIFrameElement, number>(); // for BlurRelay fast lookup

// Resolves (with frameId) only after background has confirmed RegisterChildFrame.
// Created eagerly even before the child announces, so callers can await it.
const iframeRegistration = new Map<HTMLIFrameElement, Promise<number>>();
const iframeRegistrationResolve = new Map<
  HTMLIFrameElement,
  (id: number) => void
>();

// Returns a Promise<number | undefined> that resolves when background confirms
// the child's registration, or undefined after timeoutMs.
export function awaitIframeFrameId(
  iframe: HTMLIFrameElement,
  timeoutMs: number,
): Promise<number | undefined> {
  let p = iframeRegistration.get(iframe);
  if (!p) {
    // Child hasn't announced yet — create a deferred promise.
    p = new Promise<number>((resolve) => {
      iframeRegistrationResolve.set(iframe, resolve);
    });
    iframeRegistration.set(iframe, p);
  }
  return Promise.race([
    p,
    new Promise<undefined>((r) => setTimeout(() => r(undefined), timeoutMs)),
  ]);
}

onChildFrameId((childFrameId, source) => {
  const iframe = first(
    filter(
      document.getElementsByTagName("iframe"),
      (i) => source === i.contentWindow,
    ),
  );
  if (!iframe) {
    console.warn("FrameIdAnnouncement from unknown source:", source);
    return;
  }
  iframeByFrameId.set(childFrameId, iframe);
  iframeToFrameId.set(iframe, childFrameId);

  sendToRuntime("RegisterChildFrame", { childFrameId })
    .then(() => {
      // Resolve the deferred promise (if any) or store the confirmed promise.
      const existingResolve = iframeRegistrationResolve.get(iframe);
      if (existingResolve) {
        iframeRegistrationResolve.delete(iframe);
        existingResolve(childFrameId);
      } else {
        iframeRegistration.set(iframe, Promise.resolve(childFrameId));
      }
    })
    .catch(printError);
});

announceFrameIdToParent();

const blurerClient = new BlurerClient();
const hinterClient = new HinterClient();
const keyboardHandler = new KeyboardHandler(blurerClient, hinterClient);
const rectAggregator = new RectAggregator(awaitIframeFrameId);
const blurer = new Blurer(iframeByFrameId);

async function setup() {
  const [setting, matchedBlacklist] = await Promise.all([
    settingsClient.get([
      "magicKey",
      "blurKey",
      "hints",
      "stickyKey",
      "actionKey",
      "cancelKey",
    ]),
    settingsClient.matchBlacklist(location.href),
  ]);
  keyboardHandler.setup(setting, matchedBlacklist);
  console.debug("settings loaded");
}
setup().catch(printError);

const RELEVANT_KEYS: (keyof Settings)[] = [
  "magicKey",
  "blurKey",
  "hints",
  "stickyKey",
  "actionKey",
  "cancelKey",
  "blackList",
];

let debounceController: AbortController | null = null;

chrome.storage.onChanged.addListener((changes) => {
  (async () => {
    if (!RELEVANT_KEYS.some((k) => k in changes)) return;
    debounceController?.abort();
    debounceController = new AbortController();
    const { signal } = debounceController;
    do {
      await wait(200, signal);
    } while (hinterClient.isHinting);
    await setup();
  })().catch((e) => {
    if (e instanceof DOMException && e.name === "AbortError") return;
    printError(e);
  });
});

window.navigation?.addEventListener("navigatesuccess", () => {
  settingsClient
    .matchBlacklist(location.href)
    .then((matched) => keyboardHandler.updateBlacklist(matched))
    .catch(printError);
});

chrome.runtime.onMessage.addListener(
  ChromeMessageRouter.newInstance()
    .add("ExecuteAction", ({ id, options }) =>
      rectAggregator.handleExecuteAction(id.index, options),
    )
    .add("AllRectsRequest", async ({ id, viewport, offsets }) => {
      await rectAggregator.handleAllRectsRequest(
        id,
        new Rect(viewport),
        new Coordinates(offsets),
      );
    })
    .add("BlurRelay", ({ childFrameId, rect }) => {
      blurer.handleBlurRelay(childFrameId, rect);
    })
    .buildListener(),
);

window.addEventListener(
  "keydown",
  (event) => {
    if (keyboardHandler.handleKeydown(event)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  },
  true,
);
window.addEventListener(
  "keyup",
  (event) => {
    if (keyboardHandler.handleKeyup(event)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  },
  true,
);
window.addEventListener(
  "keypress",
  (event) => {
    if (keyboardHandler.handleKeypress()) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  },
  true,
);
