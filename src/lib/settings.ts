type StoredSettings = Settings & { _area: "chrome-sync" | "chrome-local" };
type StorageKey = keyof StoredSettings;

class Storage {
  storage: chrome.storage.StorageArea;
  constructor(storage: chrome.storage.StorageArea) {
    this.storage = storage;
  }

  get<K extends StorageKey>(
    names: K[] | K | null = null,
  ): Promise<Partial<Pick<StoredSettings, K>>> {
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
  ): Promise<StoredSettings[K] | undefined> {
    return (await this.get(name))[name];
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
}

const sync = new Storage(chrome.storage.sync);
const local = new Storage(chrome.storage.local);

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
  css: "", // load from an external file
  blackList: DEFAULT_BLACK_LIST,
  additionalSelectors: DEFAULT_ADDITIONAL_SELECTORS,
};

const SETTINGS_KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[];

export default {
  async init() {
    const storage = await getStorage();
    const current = await storage.get(SETTINGS_KEYS);
    const defaults: Partial<Settings> = {};

    DEFAULT_SETTINGS.css = await fetchCss();

    for (const name of SETTINGS_KEYS) {
      if (current[name] != null) continue;
      defaults[name] = DEFAULT_SETTINGS[name];
    }

    if (Object.keys(defaults).length === 0) return;
    console.debug("Initialize some settings to default values", defaults);
    await storage.set(defaults);
  },
  async get<K extends keyof Settings>(names: K[]): Promise<Pick<Settings, K>> {
    return {
      ...pickDefaults(names),
      ...(await (await getStorage()).get(names)),
    };
  },
  async load() {
    return {
      ...DEFAULT_SETTINGS,
      ...(await (await getStorage()).get(SETTINGS_KEYS)),
    };
  },
  defaults() {
    return DEFAULT_SETTINGS;
  },
  async getBytesInUse<K extends keyof Settings>(names: K[]): Promise<number> {
    const storage = await getStorage();
    return await storage.getBytes(names);
  },
  async getTotalBytesInUse() {
    const storage = await getStorage();
    return await storage.getBytes();
  },
  async isLocal() {
    return await isLocal();
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

function pickDefaults<N extends keyof Settings>(names: N[]): Pick<Settings, N> {
  const p: Partial<Settings> = {};
  for (const n of names) {
    p[n] = DEFAULT_SETTINGS[n];
  }
  return p as Pick<Settings, N>;
}
