import settings from "../lib/settings";
import { BlackList } from "../lib/blacklist";
import { printError, printErrorUnlessTargetGone } from "../lib/errors";

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

let cachedList: BlackList | undefined;

async function loadBlackList(): Promise<BlackList> {
  if (cachedList) return cachedList;
  // getStorage() is read-only (back-fill runs only on install/update), so
  // updating the icon never writes default settings. getSingle still yields
  // the default blacklist before any back-fill has run.
  const storage = await settings.getStorage();
  cachedList = new BlackList(await storage.getSingle("blackList"));
  return cachedList;
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

// Callback-form wrappers that synchronously consume `chrome.runtime.lastError`.
// The Promise-form variants of these APIs do NOT propagate "No tab with id"
// races to the returned Promise on every Chrome version — `chrome.action.setIcon`
// in particular resolves successfully while still setting `lastError`, so a
// `.catch()` cannot observe it and Chromium logs an "Unchecked
// runtime.lastError" warning. Reading `lastError` inside the callback marks it
// as checked and silences the warning. See https://issues.chromium.org/issues/40826436
// for the parallel sendMessage discussion.
function setIconChecked(details: chrome.action.TabIconDetails): Promise<void> {
  return new Promise((resolve) => {
    chrome.action.setIcon(details, () => {
      void chrome.runtime.lastError;
      resolve();
    });
  });
}

function getTabChecked(tabId: number): Promise<chrome.tabs.Tab> {
  return new Promise((resolve, reject) => {
    chrome.tabs.get(tabId, (tab) => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve(tab);
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

export function init() {
  chrome.tabs.onActivated.addListener(({ tabId }) => {
    Promise.all([getTabChecked(tabId), loadBlackList()])
      .then(([t, list]) => updateTab(tabId, t.url, list))
      .catch(printErrorUnlessTargetGone);
  });
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // The exact onUpdated firing behavior (e.g. for history.pushState/
    // replaceState navigations) is not documented, so we react broadly to any
    // URL/status change and re-evaluate from the tab's current URL.
    if (changeInfo.url == null && changeInfo.status == null) return;
    loadBlackList()
      .then((list) => updateTab(tabId, tab.url, list))
      .catch(printErrorUnlessTargetGone);
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync" && area !== "local") return;
    if (!("blackList" in changes)) return;
    cachedList = undefined;
    updateActiveTabs().catch(printError);
  });
  updateActiveTabs().catch(printError);
}
