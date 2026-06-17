export function printError(error: unknown) {
  printWith(console.error, error);
}

export function printDebug(error: unknown) {
  printWith(console.debug, error);
}

function printWith(log: (...args: unknown[]) => void, error: unknown) {
  log(error);

  let cause = error;
  while (cause instanceof Object) {
    if ("cause" in cause) {
      cause = cause.cause;
    } else {
      break;
    }
    log("  Caused by", cause);
  }
}
