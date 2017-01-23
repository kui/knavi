declare type ChromeStorageItems = { [key: string]: string };
declare class ChromeStorageArea {
  getBytesInUse(callback: (bytesInUse: number) => void): void;
  getBytesInUse(keys: string, callback: (bytesInUse: number) => void): void;
  getBytesInUse(keys: string[], callback: (bytesInUse: number) => void): void;
  clear(callback?: () => void): void;
  set(items: ChromeStorageItems, callback?: () => void): void;
  remove(keys: string, callback?: () => void): void;
  remove(keys: string[], callback?: () => void): void;
  get(callback: (items: ChromeStorageItems) => void): void;
  get(callback: (items: ChromeStorageItems) => void): void;
  get(keys: ?string, callback: (items: ChromeStorageItems) => void): void;
  get(keys: ?string[], callback: (items: ChromeStorageItems) => void): void;
}
declare class LocalChromeStorageArea extends ChromeStorageArea {
  QUOTA_BYTES: number;
}
declare class SyncChromeStorageArea extends ChromeStorageArea {
  QUOTA_BYTES_PER_ITEM: number;
  MAX_ITEMS: number;
  MAX_WRITE_OPERATIONS_PER_HOUR: number;
  MAX_WRITE_OPERATIONS_PER_MINUTE: number;
}
declare class ChromeStorage {
  local: LocalChromeStorageArea;
  sync: SyncChromeStorageArea;
  onChanged: ChromeEventEmmitter<(changes: ChromeStorageItems, areaName: string) => any>;
}

//

declare class ChromeTabsTab {
  id: number;
}
declare class ChromeRuntimeError {
  message: string;
}
declare type ChromeMessageSender = {
  tab: ChromeTabsTab;
  frameId: number;
  id: string;
  url: string;
  tlsChannelId: string;
};
declare class ChromeRuntime {
  lastError: ChromeRuntimeError;
  onMessage: ChromeEventEmmitter<(message: any, sender: ChromeMessageSender, sendResponse: () => any) => any>;
  sendMessage(message: any,
              options?: ?{ includeTlsChannelId: boolean },
              responseCallback?: (response: any) => any): void;
  sendMessage(message: any,
              responseCallback?: (response: any) => any): void;
}

//

declare type InsertCssDetails = {
  code?: string;
  file?: string;
  allFrames?: boolean;
  frameId?: number;
  matchAboutBlank?: boolean;
  runAt?: "document_start" | "document_end" | "document_idle";
}

declare class ChromeTabs {
  query(queryInfo: any, callback: (t: ChromeTabsTab[]) => void): void;
  getCurrent(callback: (tab: ChromeTabsTab) => void): void;
  insertCSS(tabId: number, details: InsertCssDetails, callback?: () => any): void;
  insertCSS(details: InsertCssDetails, callback?: () => any): void;
  sendMessage(tabId: number,
              message: any,
              options?: { frameId?: number },
              responseCallback?: (response: any) => any): void;
  onUpdated: ChromeEventEmmitter<(tabId: number, changeInfo: any, tab: ChromeTabsTab) => any>;
}

//

declare class ChromeWebNavigation {
  getAllFrames(details: { tabId: number }, callback: (details: { frameId: number }[]) => void): void;
}

//

declare class ChromeEventEmmitter<C> {
  addListener(callback: C): void;
  removeListener(callback: C): void;
}

declare var chrome: {
  tabs: ChromeTabs;
  runtime: ChromeRuntime;
  storage: ChromeStorage;
  webNavigation: ChromeWebNavigation;
}
