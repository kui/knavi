export function printError(error: unknown) {
  print(console.error, error);
}

export function printWarn(error: unknown) {
  print(console.warn, error);
}

function print(log: (...args: unknown[]) => void, error: unknown) {
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
