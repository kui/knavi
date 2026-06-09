type StoredSettings = Settings & { _area: "chrome-sync" | "chrome-local" };
type StorageKey = keyof StoredSettings;

const DEFAULT_BLACK_LIST = `# Example (Start with # if you want comments)
http://k-ui.jp/*
`;
const DEFAULT_ADDITIONAL_SELECTORS = `{
  // Example 1
  "https://example.com/*/foo/*": [
    ".some-of",
    "#additional-css-selector",
  ],
  // Example 2
  "http://example.com/*": "you-can-use-just-one-string",

  // Tumblr
  "https://www.tumblr.com/dashboard*": [
    // Reaction buttons in tumblr dashbord
    ".note_link_current",
  ],
}`;

const DEFAULT_SETTINGS: Settings = {
  magicKey: "Space",
  hints: "asdfghjkl",
  blurKey: "",
  stickyKey: "",
  actionKey: "",
  cancelKey: "",
  css: "", // load from an external file
  blackList: DEFAULT_BLACK_LIST,
  additionalSelectors: DEFAULT_ADDITIONAL_SELECTORS,
};

const SETTINGS_KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[];

class Storage {
  storage: chrome.storage.StorageArea;
  constructor(storage: chrome.storage.StorageArea) {
    this.storage = storage;
  }

  async backfillDefaults() {
    const current = await this.get(SETTINGS_KEYS);
    const defaults: Partial<Settings> = {};
    for (const name of SETTINGS_KEYS) {
      if (current[name] != null) continue;
      if (name === "css") {
        defaults.css = await fetchCss();
      } else {
        defaults[name] = DEFAULT_SETTINGS[name];
      }
    }

    if (Object.keys(defaults).length > 0) {
      const recheck = await this.get(
        Object.keys(defaults) as (keyof Settings)[],
      );
      for (const key of Object.keys(defaults) as (keyof Settings)[]) {
        if (recheck[key] != null) delete defaults[key];
      }
    }

    if (Object.keys(defaults).length > 0) {
      console.debug("Backfill settings to default values", defaults);
      await this.set(defaults);
    }
  }

  get<K extends StorageKey>(names: K[] | K): Promise<Pick<StoredSettings, K>> {
    return new Promise((resolve, reject) => {
      this.storage.get(names, (items) => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(Error(err.message));
          return;
        }
        resolve(items as Pick<StoredSettings, K>);
      });
    });
  }

  async getSingle<K extends keyof StoredSettings>(
    name: K,
  ): Promise<StoredSettings[K]> {
    return (await this.get(name))[name];
  }

  // Read-only counterparts of get/getSingle that substitute the default value
  // for any key still missing in storage. Used by consumers so reads stay
  // correct even before the onInstalled back-fill has run (e.g. right after a
  // fresh install). No write happens, so there is no read-modify-write race.
  async getWithDefaults<K extends keyof Settings>(
    names: K[],
  ): Promise<Pick<Settings, K>> {
    const current = await this.get(names);
    const result = {} as Pick<Settings, K>;
    for (const name of names) {
      if (current[name] != null) {
        result[name] = current[name];
      } else if (name === "css") {
        result[name] = await fetchCss();
      } else {
        result[name] = DEFAULT_SETTINGS[name];
      }
    }
    return result;
  }

  async getSingleWithDefault<K extends keyof Settings>(
    name: K,
  ): Promise<Settings[K]> {
    return (await this.getWithDefaults([name]))[name];
  }

  set(items: Partial<Settings>) {
    return new Promise<void>((resolve, reject) => {
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

  async setSingle<K extends keyof Settings>(name: K, value: Settings[K]) {
    await this.set({ [name]: value });
  }

  getBytes<K extends keyof Settings>(names: K[] | K | null = null) {
    return new Promise<number>((resolve, reject) => {
      this.storage.getBytesInUse(names, (b) => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(Error(err.message));
          return;
        }
        resolve(b);
      });
    });
  }

  async getTotalBytes() {
    return await this.getBytes();
  }
}

const sync = new Storage(chrome.storage.sync);
const local = new Storage(chrome.storage.local);

let storage: Storage | null = null;

export default {
  async init(force = false): Promise<Storage> {
    if (force) storage = null;
    if (storage) return storage;
    storage = await getStorage();
    return storage;
  },
  // Writes default values for any missing keys. Run only from the
  // onInstalled handler, never on ordinary startup: this read-modify-write is
  // non-atomic and could clobber a concurrent settings write.
  async backfillDefaults(): Promise<void> {
    const s = await getStorage();
    await s.backfillDefaults();
  },
  async defaults(): Promise<Settings> {
    return {
      ...DEFAULT_SETTINGS,
      css: await fetchCss(),
    };
  },
  async quotaBytesPerItem() {
    return (await isLocal())
      ? chrome.storage.local.QUOTA_BYTES
      : chrome.storage.sync.QUOTA_BYTES_PER_ITEM;
  },
  async quotaTotalBytes() {
    return (await isLocal())
      ? chrome.storage.local.QUOTA_BYTES
      : chrome.storage.sync.QUOTA_BYTES;
  },
};

async function fetchCss() {
  const r = await fetch("./default-style.css");
  return await r.text();
}

async function isLocal() {
  const a = await local.getSingle("_area");
  return a === "chrome-local";
}

async function getStorage() {
  return (await isLocal()) ? local : sync;
}
