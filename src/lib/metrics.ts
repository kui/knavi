export class Timers {
  private timers = new Map<string, { count: number; millis: number }>();

  constructor(private readonly prefix: string) {}

  start(name: string): () => void {
    const key = `${this.prefix}:${name}`;
    const start = performance.now();
    return () => {
      const millis = performance.now() - start;
      const current = this.timers.get(key);
      if (current) {
        current.count++;
        current.millis += millis;
      } else {
        this.timers.set(key, { count: 1, millis });
      }
    };
  }

  print(): void {
    for (const [key, { count, millis }] of this.timers.entries()) {
      console.debug(
        `${key}: ${count} times, ${millis.toFixed(3)}ms, avg: ${(
          millis / count
        ).toFixed(3)}ms`,
      );
    }
  }
}
