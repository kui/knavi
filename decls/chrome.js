declare type ChromeStorageItems = { [key: string]: string };
declare class ChromeStorageListenee {
  addListener(callback: (changes: ChromeStorageItems, areaName: string) => void): void;
}
declare class ChromeStorageArea {
  onChanged: ChromeStorageListenee;
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
  onMessage: {
    addListener(callback: (message: any, sender: ChromeMessageSender, sendResponse: () => any) => any): void;
  };
  sendMessage(message: any,
              options?: { includeTlsChannelId: boolean },
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
  insertCSS(tabId: number, details: InsertCssDetails, callback?: () => any): void;
  insertCSS(details: InsertCssDetails, callback?: () => any): void;
  onUpdated: {
    addListener(callback: (tabId: number, changeInfo: any, tab: ChromeTabsTab) => any): void;
  };
}

//

declare var chrome: {
  tabs: ChromeTabs;
  runtime: ChromeRuntime;
  storage: ChromeStorage;
}
