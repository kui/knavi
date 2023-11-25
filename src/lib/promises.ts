export function wait(ms: number): {
  promise: Promise<void>;
  cancel: () => void;
} {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  return {
    promise: new Promise((resolve) => {
      timeoutId = setTimeout(resolve, ms);
    }),
    cancel: () => {
      clearTimeout(timeoutId!);
    },
  };
}
