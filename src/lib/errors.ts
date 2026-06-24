export function printError(error: unknown) {
  console.error(error);

  let cause = error;
  while (cause instanceof Object) {
    if ("cause" in cause) {
      cause = cause.cause;
    } else {
      break;
    }
    console.error("  Caused by", cause);
  }
}

// True when the error indicates the target tab/frame has gone away
// (closed or navigated) between when we decided to talk to it and when
// the call reached Chrome. These races are benign — the operation no
// longer has anything to act on — so callers can swallow them quietly
// instead of surfacing a misleading "error".
export function isTargetGoneError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const m = error.message;
  return (
    m.startsWith("No tab with id:") ||
    m.startsWith("No frame with id ") ||
    m.includes("Receiving end does not exist") ||
    m.toLowerCase().includes("message port closed")
  );
}

// catch handler that prints unless the error is a benign "target gone" race.
export function printErrorUnlessTargetGone(error: unknown) {
  if (isTargetGoneError(error)) {
    console.debug("Target gone, ignoring:", error);
    return;
  }
  printError(error);
}
