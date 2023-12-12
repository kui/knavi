import { wait } from "./promises";

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

export class AsyncCache<Key, Value> {
  private readonly c = new Map<Key, Promise<Value>>();

  constructor(private readonly timeoutMillis: number) {}

  getOr(k: Key, f: (k: Key) => Value | Promise<Value>): Promise<Value> {
    const current = this.c.get(k);
    if (current) return current;
    const timeout = wait(this.timeoutMillis);
    const p = Promise.race([
      wait(0)
        .promise.then(() => f(k))
        .finally(() => timeout.cancel()),
      timeout.promise.then(() =>
        Promise.reject(new Error(`Timeout: ${String(k)}`)),
      ),
    ]);
    this.c.set(k, p);
    return p;
  }
}
