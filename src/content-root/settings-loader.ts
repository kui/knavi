export interface RootSettings {
  css: string;
  hints: string;
  cycleKey: string;
}

/* WHY: `_area` is the marker for the active storage area; switching it changes
   every value at once without a per-key change event. */
const RELEVANT_KEYS = ["css", "hints", "cycleKey", "_area"];

export function isRelevantChange(changes: Record<string, unknown>): boolean {
  return RELEVANT_KEYS.some((k) => k in changes);
}

/**
 * Loads the settings from the active storage area and applies them.
 * A load that was superseded by a later one is dropped, so a slow older read
 * cannot overwrite newer values.
 */
export class SettingsLoader {
  private generation = 0;

  constructor(
    private readonly read: () => Promise<RootSettings>,
    private readonly apply: (settings: RootSettings) => void,
  ) {}

  async load(): Promise<void> {
    const generation = ++this.generation;
    const settings = await this.read();
    if (generation !== this.generation) return;
    this.apply(settings);
  }
}
