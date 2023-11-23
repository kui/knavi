import Cache from "./cache";

export default class CachedFetcher<Key, Value> {
  readonly cache: Cache<Key, Value>;
  readonly fallback: (k: Key) => Value;

  constructor(fallback: (k: Key) => Value) {
    this.cache = new Cache();
    this.fallback = fallback;
  }

  get(k: Key): Value {
    return this.cache.getOr(k, this.fallback);
  }
}
