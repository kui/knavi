declare interface Settings {
  /**
   * WHY: "magicKey" is the legacy storage key; the UI label is "Peek Key".
   * Renaming the storage key would invalidate existing users' settings, so
   * only the label was updated.
   */
  magicKey: string;
  hints: string;
  blurKey: string;
  stickyKey: string;
  actionKey: string;
  cancelKey: string;
  css: string;
  blackList: string;
  additionalSelectors: string;
}
