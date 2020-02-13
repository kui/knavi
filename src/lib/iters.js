export function* traverseParent(element, includeSelf) {
  let p = includeSelf ? element : element.parentElement;
  while (p instanceof Element) {
    yield p;
    p = p.parentElement;
  }
}

export function* traverseFirstChild(element, includeSelf) {
  let c = includeSelf ? [element] : element.children;
  while (c.length >= 1) {
    yield c[0];
    c = c[0].children;
  }
}

export function* takeWhile(iter, p) {
  for (const e of iter) {
    if (!p(e)) break;
    yield e;
  }
}

export function reduce(i, m, initValue) {
  let u = initValue;
  for (const e of i) u = m(u, e);
  return u;
}

export function length(i) {
  return reduce(i, n => ++n, 0);
}

export function first(i) {
  for (const e of i) return e;
  return null;
}

export function head(iter, n) {
  let i = 0;
  return takeWhile(iter, () => i++ < n);
}

export function* concat(...i) {
  for (const ii of i) for (const e of ii) yield e;
}

export function* filter(i, p) {
  for (const e of i) if (p(e)) yield e;
}

export function* map(i, m) {
  for (const e of i) yield m(e);
}

export function* flatMap(i, m) {
  for (const e of i) for (const u of m(e)) yield u;
}

export function distinct(i) {
  const s = new Set();
  return filter(i, e => {
    if (s.has(e)) return false;
    s.add(e);
    return true;
  });
}
