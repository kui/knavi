export function* takeWhile<E>(
  iter: Iterable<E>,
  p: (e: E) => boolean,
): Generator<E> {
  for (const e of iter) {
    if (!p(e)) break;
    yield e;
  }
}

export function reduce<E, R>(
  i: Iterable<E>,
  f: (u: R, e: E) => R,
  initValue: R,
): R {
  let u = initValue;
  for (const e of i) u = f(u, e);
  return u;
}

export function length(i: Iterable<unknown>): number {
  return reduce(i, (n) => ++n, 0);
}

export function first<E>(i: Iterable<E>): E | null {
  for (const e of i) return e;
  return null;
}

export function head<E>(i: Iterable<E>, n: number): Generator<E> {
  return takeWhile(i, () => n-- > 0);
}

export function* filter<E>(i: Iterable<E>, p: (e: E) => boolean): Generator<E> {
  for (const e of i) if (p(e)) yield e;
}

export function* map<E, R>(i: Iterable<E>, f: (e: E) => R): Generator<R> {
  for (const e of i) yield f(e);
}

export function flat<E>(i: Iterable<Iterable<E>>): Generator<E> {
  return flatMap(i, (e) => e);
}

export function* flatMap<E, R>(
  i: Iterable<E>,
  f: (e: E) => Iterable<R>,
): Generator<R> {
  for (const e of i) for (const u of f(e)) yield u;
}

export function groupIntoObjectBy<E>(
  i: Iterable<E>,
  getKey: (e: E) => string,
): Record<string, E[]> {
  return reduce<E, Record<string, E[]>>(
    i,
    (o, e) => {
      const key = getKey(e);
      if (!o[key]) o[key] = [];
      o[key].push(e);
      return o;
    },
    {},
  );
}
