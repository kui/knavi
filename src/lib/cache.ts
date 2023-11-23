export default class Cache<Key, Value> {
  private readonly storage: Map<Key, Value>;

  constructor() {
    this.storage = new Map();
  }

  getOr(k: Key, f: (k: Key) => Value): Value {
    if (this.storage.has(k)) {
      return this.storage.get(k) as Value;
    }

    const v = f(k);
    this.storage.set(k, v);
    return v;
  }
}
