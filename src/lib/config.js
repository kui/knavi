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
}

export const sync  = new Storage(chrome.storage.sync);
export const local = new Storage(chrome.storage.local);

class Config {
  async get(names?: string | string[]): Promise<ChromeStorageItems> {
    const s = await this.getStorage();
    return s.get(names);
  }

  async getSingle(name: string): Promise<?string> {
    const s = await this.getStorage();
    const v = await s.get(name);
    return v[name];
  }

  async getStorage(): Promise<Storage> {
    const result = await local.get("_area");
    switch (result["_area"]) {
    case "chrome-local": return local;
    case "chrome-sync":  return sync;
    case undefined:      return sync;
    default: throw Error("Unknown storage area: " + result["_area"]);
    }
  }
}

export const config = new Config();

export default { sync, local, config };
