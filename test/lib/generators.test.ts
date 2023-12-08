import { createQueue } from "../../src/lib/generators.ts";

describe("createQueue", () => {
  it("should dequeue all values if enqueued before dequeueing", async () => {
    const { enqueue, dequeue } = createQueue<number>();

    enqueue.next(0);
    enqueue.next(1);
    enqueue.next(2);

    let count = 0;
    for await (const n of dequeue) {
      expect(n).toBe(count++);
      if (count === 3) break;
    }
  });
  it("should dequeue values if enqueued after dequeueing", async () => {
    const { enqueue, dequeue } = createQueue<number>();
    const expectPromise = (async () => {
      let count = 0;
      for await (const n of dequeue) {
        expect(n).toBe(count++);
        if (count === 3) break;
      }
    })();

    await timeout(100);
    enqueue.next(0);
    await timeout(100);
    enqueue.next(1);
    await timeout(100);
    enqueue.next(2);
    await expectPromise;
  });
});

function timeout(msec: number): Promise<void> {
  return new Promise((r) => setTimeout(r, msec));
}
