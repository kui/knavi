export default class Cache {
  constructor(fallback) {
    this.f = fallback;
    this.clear();
  }

  get(k) {
    if (this.f) {
      return this.getOr(k, this.f);
    } else {
      throw Error("require fallback function");
    }
  }

  getOr(k, f) {
    const v = this.c.get(k);
    if (v) return v;

    const vv = f(k);
    this.c.set(k, vv);
    return vv;
  }

  clear() {
    this.c = new Map();
  }
}
