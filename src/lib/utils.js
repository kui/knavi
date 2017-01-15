export function nextTick(): Promise<number> {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}
