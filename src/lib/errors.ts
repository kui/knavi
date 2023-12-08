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
