import settings from "./settings";
import { BlackList } from "./blacklist";
import { AdditionalSelectors } from "./additional-selectors";
import { Router, sendToTab } from "./chrome-messages";
import { flatMap } from "./iters";
import { printError } from "./errors";

let settingValues: Promise<Settings>;
let blackList: Promise<BlackList>;
let additionalSelectors: Promise<AdditionalSelectors>;

function setup() {
  settingValues = settings.load();
  blackList = settingValues.then((s) => new BlackList(s.blackList));
  additionalSelectors = buildAdditionalSelectors();
  settingValues
    .then((s) => console.log("Settings loaded", s))
    .catch(printError);
}
settings.init().then(setup).catch(printError);

export const router = Router.newInstance()
  .add("GetSettings", async (message) => {
    const s = await settingValues;
    if (message.names) {
      return pick(s, message.names);
    } else {
      return s;
    }
  })
  .add("MatchBlacklist", async (message) => {
    return await blackList.then((b) => b.match(message.url));
  })
  .add("MatchAdditionalSelectors", async (message) => {
    return await additionalSelectors.then((s) => s.match(message.url));
  });

chrome.storage.onChanged.addListener(() => {
  (async () => {
    setup();
    const s = await settingValues;
    const sendTasks = flatMap(await tabsQuery({}), (t) => {
      if (!t.id) return [];
      return [sendToTab(t.id, "BroadcastNewSettings", s)];
    });
    await Promise.all(sendTasks);
  })().catch(printError);
});

function tabsQuery(
  queryInfo: chrome.tabs.QueryInfo,
): Promise<chrome.tabs.Tab[]> {
  return new Promise((resolve) => chrome.tabs.query(queryInfo, resolve));
}

function pick<N extends keyof Settings>(
  s: Settings,
  names: N[],
): Pick<Settings, N> {
  const r: Partial<Settings> = {};
  for (const name of names) {
    r[name] = s[name];
  }
  return r as Pick<Settings, N>;
}

async function buildAdditionalSelectors() {
  try {
    return new AdditionalSelectors((await settingValues).additionalSelectors);
  } catch (e) {
    printError(e);
    return new AdditionalSelectors("{}");
  }
}
