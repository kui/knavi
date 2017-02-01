// @flow

export default class Cache<K, V> {
  c: Map<K, V>;
  f: ?(k: K) => V;

  constructor(fallback?: (k: K) => V) {
    this.f = fallback;
    this.clear();
  }

  get(k: K): V {
    if (this.f) {
      return this.getOr(k, this.f);
    } else {
      throw Error("require fallback function");
    }
  }

  getOr(k: K, f: (k: K) => V): V {
    const v = this.c.get(k);
    if (v) return v;

    const vv = f(k);
    this.c.set(k, vv);
    return vv;
  }

  clear() {
    this.c = new Map;
  }
}
