// @flow

import { EventEmitter } from "./event-emitter";

class Storage {
  storage: ChromeStorageArea;

  constructor(storage: ChromeStorageArea) {
    this.storage = storage;
  }

  get(names?: string | string[]): Promise<ChromeStorageItems> {
    return new Promise((resolve, reject) => {
      this.storage.get(names, (items) => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(Error(err.message));
          return;
        }
        resolve(items);
      });
    });
  }

  async getSingle(name: string): Promise<?string> {
    return (await this.get(name))[name];
  }

  set(items: ChromeStorageItems): Promise<void> {
    return new Promise((resolve, reject) => {
      this.storage.set(items, () => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(Error(err.message));
          return;
        }
        resolve();
      });
    });
  }

  async setSingle(name: string, value: string): Promise<void> {
    await this.set({[name]: value});
  }
}

const sync  = new Storage(chrome.storage.sync);
const local = new Storage(chrome.storage.local);

const DEFAULT_SETTINGS = {
  magicKey: "Space",
  hints: "ASDFGHJKL",
  blurKey: "",
  css: "",
};

export interface Settings {
  magicKey: string;
  hints: string;
  blurKey: string;
  css: string;
}

const onUpdated: EventEmitter<Settings> = new EventEmitter;
let currentSettingsPromise: Promise<Settings>;
update();
chrome.storage.onChanged.addListener((changes, area) => {
  console.debug("changes=", changes,
                "area=", area,
                "location=", location.href);
  update();
});

export default {
  async init(): Promise<void> {
    const storage = await getStorage();
    const s = await getAll(storage);
    const changes = {};
    for (const name of Object.keys(DEFAULT_SETTINGS)) {
      if (name in s) continue;
      switch (name) {
      case "css":
        changes.css = await fetchCss();
        break;
      default:
        changes[name] = DEFAULT_SETTINGS[name];
        break;
      }
    }
    if (Object.keys(changes).length === 0) return;
    console.debug("Initialize settings", changes);
    await storage.set(changes);
  },
  async load() {},
  /// Return a promise resolved when the first callback execution.
  async listen(callback: (v: Settings) => void) {
    onUpdated.listen(callback);
    const s = await currentSettingsPromise;
    console.debug("Init settings callback:", s, "location=", location.href);
    callback(s);
  },
  async loadDefaults(): Promise<Settings> {
    return Object.assign({}, DEFAULT_SETTINGS, { css: await fetchCss() });
  }
};

async function fetchCss(): Promise<string> {
  return await (await fetch("./default-style.css")).text();
}

async function update() {
  currentSettingsPromise = getAll();
  onUpdated.emit(await currentSettingsPromise);
}

async function getAll(storage): Promise<Settings> {
  if (!storage)
    storage = await getStorage();
  return Object.assign(
    {},
    DEFAULT_SETTINGS,
    await storage.get(Object.keys(DEFAULT_SETTINGS))
  );
}

async function getStorage(): Promise<Storage> {
  const a = await local.getSingle("_area");
  switch (a) {
  case "chrome-local": return local;
  case "chrome-sync":  return sync;
  default:             return sync;
  }
}
