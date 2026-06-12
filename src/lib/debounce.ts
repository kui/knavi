/**
 * Returns a debounced trigger function. Calling the trigger collapses rapid
 * calls into one, then waits `delay` ms of quiet before invoking `fn`. If
 * `ready()` returns false when the timer fires, it reschedules and keeps
 * retrying every `delay` ms until `ready()` is true.
 */
export function debounceUntilReady(
  fn: () => unknown,
  delay: number,
  ready: () => boolean,
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  function schedule() {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (!ready()) {
        schedule();
        return;
      }
      fn();
    }, delay);
  }

  return schedule;
}
