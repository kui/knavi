export function createQueue<T>(): {
  enqueue: Generator<void, void, T>;
  // Wait if the queue is empty.
  dequeue: AsyncGenerator<T | undefined, void, void>;
} {
  const queue: (T | undefined)[] = [];
  let notify: (() => void) | undefined;

  const enqueue = (function* (): Generator<void, void, T | undefined> {
    while (true) {
      queue.push(yield);
      if (notify) {
        notify();
        notify = undefined;
      }
    }
  })();
  enqueue.next();

  const dequeue = (async function* () {
    while (true) {
      if (queue.length === 0) {
        await new Promise<void>((r) => {
          notify = r;
        });
        continue;
      }
      yield queue.shift()!;
    }
  })();

  return {
    enqueue,
    dequeue,
  };
}
