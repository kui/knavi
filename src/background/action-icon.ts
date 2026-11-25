import settings from "../lib/settings";
import { BlackList } from "../lib/blacklist";
import { printError, printErrorUnlessTargetGone } from "../lib/errors";
import {
  AREA_MARKER,
  isRelevantChange,
  readActiveArea,
} from "../lib/settings-change";

const ENABLED_ICON = {
  16: "icon16.png",
  48: "icon48.png",
  128: "icon128.png",
};
const DISABLED_ICON = {
  16: "icon-disabled16.png",
  48: "icon-disabled48.png",
  128: "icon-disabled128.png",
};

/* WHY: caches the promise, not the list, so an invalidation during a read
   cannot be overwritten by that read's stale result: the invalidation clears
   this variable and the stale read only fills its own (discarded) promise. */
let cachedList: Promise<BlackList> | undefined;

function loadBlackList(): Promise<BlackList> {
  if (cachedList) return cachedList;
  /* WHY: getStorage() is read-only (back-fill runs only on install/update), so
     updating the icon never writes default settings. getSingle still yields
     the default blacklist before any back-fill has run. */
  const loading = settings
    .getStorage()
    .then((storage) => storage.getSingle("blackList"))
    .then((text) => new BlackList(text));
  cachedList = loading;
  loading.catch(() => {
    if (cachedList === loading) cachedList = undefined;
  });
  return loading;
}

function isDisabled(url: string | undefined, list: BlackList): boolean {
  if (!url) return true;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return true;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return true;
  return list.match(url).length > 0;
}

/**
 * `chrome.action.setIcon`'s Promise form resolves successfully even on error,
 * while still populating `chrome.runtime.lastError`. So `.catch()` never
 * fires and Chromium logs an "Unchecked runtime.lastError" warning. The
 * callback form is the only way to observe the error: read `lastError`
 * inside the callback (which marks it checked) and surface it as a rejection.
 * See https://issues.chromium.org/issues/337214677
 */
function setIconChecked(details: chrome.action.TabIconDetails): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.action.setIcon(details, () => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve();
    });
  });
}

async function updateTab(
  tabId: number,
  url: string | undefined,
  list: BlackList,
) {
  await setIconChecked({
    tabId,
    path: isDisabled(url, list) ? DISABLED_ICON : ENABLED_ICON,
  });
}

async function updateActiveTabs() {
  const list = await loadBlackList();
  const tabs = await chrome.tabs.query({ active: true });
  await Promise.all(
    tabs
      .filter((t) => t.id != null)
      .map((t) =>
        updateTab(t.id!, t.url, list).catch(printErrorUnlessTargetGone),
      ),
  );
}

export function onActivated({ tabId }: chrome.tabs.OnActivatedInfo) {
  Promise.all([chrome.tabs.get(tabId), loadBlackList()])
    .then(([t, list]) => updateTab(tabId, t.url, list))
    .catch(printErrorUnlessTargetGone);
}

export function onUpdated(
  tabId: number,
  changeInfo: chrome.tabs.OnUpdatedInfo,
  tab: chrome.tabs.Tab,
) {
  /* WHY: The exact onUpdated firing behavior (e.g. for history.pushState/
     replaceState navigations) is not documented, so we react broadly to any
     URL/status change and re-evaluate from the tab's current URL. */
  if (changeInfo.url == null && changeInfo.status == null) return;
  loadBlackList()
    .then((list) => updateTab(tabId, tab.url, list))
    .catch(printErrorUnlessTargetGone);
}

export function onStorageChanged(
  changes: Record<string, chrome.storage.StorageChange>,
  area: chrome.storage.AreaName,
) {
  void handleStorageChange(changes, area);
}

/** Never rejects; errors are printed. */
export async function handleStorageChange(
  changes: Record<string, chrome.storage.StorageChange>,
  area: chrome.storage.AreaName,
): Promise<void> {
  try {
    await reloadOnChange(changes, area);
  } catch (e) {
    printError(e);
  }
}

async function reloadOnChange(
  changes: Record<string, chrome.storage.StorageChange>,
  area: chrome.storage.AreaName,
): Promise<void> {
  if (!(await isRelevantChange(changes, area, ["blackList"], readActiveArea)))
    return;
  cachedList = undefined;
  /* WHY: settings.getStorage() memoizes the area, and the settings module
     resets it from its own listener. Resetting here too keeps the icon
     correct whichever listener runs first. */
  if (area === "local" && AREA_MARKER in changes) {
    await settings.getStorage(true);
  }
  await updateActiveTabs();
}

export function init() {
  updateActiveTabs().catch(printError);
}
