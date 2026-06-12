export class Cache<Key, Value> {
  private readonly c = new Map<Key, Value>();

  getOr(k: Key, f: (k: Key) => Value): Value {
    if (this.c.has(k)) {
      return this.c.get(k)!;
    }

    const v = f(k);
    this.c.set(k, v);
    return v;
  }
}

export class CachedFetcher<Key, Value> {
  private readonly c = new Cache<Key, Value>();

  constructor(private readonly fallback: (k: Key) => Value) {}

  get(k: Key): Value {
    return this.c.getOr(k, this.fallback);
  }
}
