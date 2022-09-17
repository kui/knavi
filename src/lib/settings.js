class Storage {
  constructor(storage) {
    this.storage = storage;
  }

  get(names) {
    return new Promise((resolve, reject) => {
      this.storage.get(names, items => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(Error(err.message));
          return;
        }
        resolve(items);
      });
    });
  }

  async getSingle(name) {
    return (await this.get(name))[name];
  }

  set(items) {
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

  async setSingle(name, value) {
    await this.set({ [name]: value });
  }

  getBytes(names) {
    return new Promise((resolve, reject) => {
      this.storage.getBytesInUse(names, b => {
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

const DEFAULT_SETTINGS = {
  magicKey: "Space",
  cancelKey: "Escape",
  hints: "asdfghjkl",
  blurKey: "",
  css: "", // load from an external file
  blackList: DEFAULT_BLACK_LIST,
  additionalSelectors: DEFAULT_ADDITIONAL_SELECTORS
};

export default {
  async init() {
    const storage = await getStorage();
    const s = await storage.get(Object.keys(DEFAULT_SETTINGS));
    const changes = {};
    for (const name of Object.keys(DEFAULT_SETTINGS)) {
      if (s[name] != null) continue;
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
  async load() {
    return getAll();
  },
  async loadDefaults() {
    return Object.assign({}, DEFAULT_SETTINGS, { css: await fetchCss() });
  },
  async getBytesInUse(name) {
    const storage = await getStorage();
    return await storage.getBytes(name);
  },
  async getTotalBytesInUse() {
    const storage = await getStorage();
    return await storage.getBytes();
  },
  async isLocal() {
    return await isLocal();
  }
};

async function fetchCss() {
  return await (await fetch("./default-style.css")).text();
}

async function getAll(storage) {
  if (!storage) storage = await getStorage();
  return Object.assign(
    {},
    DEFAULT_SETTINGS,
    await storage.get(Object.keys(DEFAULT_SETTINGS))
  );
}

async function isLocal() {
  const a = await local.getSingle("_area");
  return a === "chrome-local";
}

async function getStorage() {
  return (await isLocal()) ? local : sync;
}
