export function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () =>
      reject(
        signal!.reason instanceof Error
          ? signal!.reason
          : new DOMException("Aborted", "AbortError"),
      );

    if (signal?.aborted) {
      abort();
      return;
    }
    const timeoutId = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeoutId);
        abort();
      },
      { once: true },
    );
  });
}
