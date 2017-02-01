// @flow

export function* traverseParent(element: Element, includeSelf?: boolean): Iterator<Element> {
  let p = includeSelf ? element : element.parentElement;
  while (p != null) {
    yield p;
    p = p.parentElement;
  }
}

export function* traverseFirstChild(element: HTMLElement, includeSelf?: boolean): Iterator<HTMLElement> {
  let c: HTMLElement[] | HTMLCollection<HTMLElement> = includeSelf ? [element] : element.children;
  while (c.length >= 1) {
    yield c[0];
    c = c[0].children;
  }
}

export function* takeWhile<T>(iter: Iterator<T> | Iterable<T>, p: (t: T) => boolean): Iterator<T> {
  for (const e of iter) {
    if (!p(e)) break;
    yield e;
  }
}

export function reduce<T, U>(i: Iterable<T> | Iterator<T>, m: (u: U, t: T) => U, initValue: U): U {
  let u = initValue;
  for (const e of i) u = m(u, e);
  return u;
}

export function length<T>(i: Iterable<T> | Iterator<T>): number {
  return reduce(i, (n) => ++n, 0);
}

export function first<T>(i: Iterator<T> | Iterable<T>): ?T {
  for (const e of i) return e;
  return null;
}

export function head<T>(iter: Iterator<T> | Iterable<T>, n: number): Iterator<T> {
  let i = 0;
  return takeWhile(iter, () => i++ < n);
}

export function* concat<T>(...i: Array<Iterable<T> | Iterator<T>>): Iterator<T> {
  for (const ii of i) for (const e of ii) yield e;
}

export function* filter<T>(i: Iterable<T> | Iterator<T>, p: (t: T) => boolean): Iterator<T> {
  for (const e of i) if (p(e)) yield e;
}

export function* map<T, U>(i: Iterable<T> | Iterator<T>, m: (t: T) => U): Iterable<U> {
  for (const e of i) yield m(e);
}

export function* flatMap<T, U>(i: Iterable<T> | Iterator<T>,
                               m: (t: T) => Iterable<U> | Iterator<U>): Iterable<U> {
  for (const e of i) for (const u of m(e)) yield u;
}

export function distinct<T>(i: Iterable<T> | Iterator<T>): Iterable<T> {
  const s = new Set();
  return filter(i, (e) => {
    if (s.has(e)) return false;
    s.add(e);
    return true;
  });
}
