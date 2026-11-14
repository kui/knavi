export const ROOT_KEYS = ["css", "hints", "cycleKey"] as const;

export type RootSettings = Pick<Settings, (typeof ROOT_KEYS)[number]>;

export class SettingsLoader {
  private started = 0;
  private applied = 0;

  constructor(
    private readonly read: () => Promise<RootSettings>,
    private readonly apply: (settings: RootSettings) => void,
  ) {}

  /* INVARIANT: a result is applied only if no later load has been applied
     already. A slow older read cannot overwrite newer values, and an older
     read that succeeds still applies when the newer one fails. */
  async load(): Promise<void> {
    const generation = ++this.started;
    const settings = await this.read();
    if (generation < this.applied) return;
    this.applied = generation;
    this.apply(settings);
  }
}
