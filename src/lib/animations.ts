export function nextAnimationFrame(): Promise<DOMHighResTimeStamp> {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

// Returns the timestamp of the first frame after the predicate returns true.
export async function waitUntil(
  predicate: () => boolean,
): Promise<DOMHighResTimeStamp> {
  let r: DOMHighResTimeStamp = 0;
  while (!predicate()) {
    r = await nextAnimationFrame();
  }
  return r;
}
