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

  async getSingle(name: string): Promise<string> {
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

export const sync  = new Storage(chrome.storage.sync);
export const local = new Storage(chrome.storage.local);

class Config {
  async get(names?: string | string[]): Promise<ChromeStorageItems> {
    const s = await this.getStorage();
    return s.get(names);
  }

  async getSingle(name: string): Promise<?string> {
    const s = await this.getStorage();
    return await s.getSingle(name);
  }

  async set(items: ChromeStorageItems) {
    const s = await this.getStorage();
    await s.set(items);
  }

  async setSingle(name: string, value: string) {
    const s = await this.getStorage();
    await s.setSingle(name, value);
  }

  async getStorage(): Promise<Storage> {
    const result = await local.get("_area");
    switch (result["_area"]) {
    case "chrome-local": return local;
    case "chrome-sync":  return sync;
    default:      return sync;
    }
  }
}

export const config = new Config();

export default { sync, local, config };
