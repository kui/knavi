export const ROOT_KEYS = ["css", "hints", "cycleKey"] as const;

export type RootSettings = Pick<Settings, (typeof ROOT_KEYS)[number]>;

export class SettingsLoader {
  private started = 0;
  private applied = 0;

  constructor(
    private readonly read: () => Promise<RootSettings>,
    private readonly apply: (settings: RootSettings) => void,
  ) {}

  /* WHY: `started` and `applied` are separate so an older read that succeeds
     still applies when a newer read fails; a single "latest" counter would
     drop it. */
  async load(): Promise<void> {
    const generation = ++this.started;
    const settings = await this.read();
    if (generation < this.applied) return;
    this.applied = generation;
    this.apply(settings);
  }
}
