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

export function last<E>(i: Iterable<E>): E | null {
  let e: E | null = null;
  for (e of i);
  return e;
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
  f: (e: E, index: number) => Iterable<R>,
): Generator<R> {
  let n = 0;
  for (const e of i) for (const u of f(e, n++)) yield u;
}

export async function* asyncFlatMap<E, R>(
  i: Iterable<E> | AsyncIterable<E>,
  f: (
    e: E,
    index: number,
  ) => Iterable<R> | AsyncIterable<R> | Promise<Iterable<R>>,
): AsyncGenerator<R> {
  let n = 0;
  for await (const e of i) {
    const ii = f(e, n++);
    if (ii instanceof Promise) for (const u of await ii) yield u;
    else for await (const u of ii) yield u;
  }
}

export async function toAsyncArray<E>(i: AsyncIterable<E>): Promise<E[]> {
  const a: E[] = [];
  for await (const e of i) a.push(e);
  return a;
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

export function* zip<E1, E2>(
  i1: Iterable<E1>,
  i2: Iterable<E2>,
): Generator<[E1, E2]> {
  const g1 = map(i1, (e) => e);
  for (const e2 of i2) {
    const e1 = g1.next();
    if (e1.done) break;
    yield [e1.value, e2];
  }
}
