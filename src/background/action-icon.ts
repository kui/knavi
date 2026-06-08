import settings from "../lib/settings";
import { BlackList } from "../lib/blacklist";
import { printError } from "../lib/errors";

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
  const storage = await settings.init();
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

async function updateTab(
  tabId: number,
  url: string | undefined,
  list: BlackList,
) {
  await chrome.action.setIcon({
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
      .map((t) => updateTab(t.id!, t.url, list).catch(printError)),
  );
}

export function init() {
  chrome.tabs.onActivated.addListener(({ tabId }) => {
    Promise.all([chrome.tabs.get(tabId), loadBlackList()])
      .then(([t, list]) => updateTab(tabId, t.url, list))
      .catch(printError);
  });
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    const url = changeInfo.url;
    if (!url) return;
    loadBlackList()
      .then((list) => updateTab(tabId, url, list))
      .catch(printError);
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync" && area !== "local") return;
    if (!("blackList" in changes)) return;
    cachedList = undefined;
    updateActiveTabs().catch(printError);
  });
  updateActiveTabs().catch(printError);
}
