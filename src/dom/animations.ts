export function nextAnimationFrame(): Promise<DOMHighResTimeStamp> {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

export async function waitUntil(
  predicate: () => boolean,
): Promise<DOMHighResTimeStamp> {
  let r: DOMHighResTimeStamp = 0;
  while (!predicate()) {
    r = await nextAnimationFrame();
  }
  return r;
}
