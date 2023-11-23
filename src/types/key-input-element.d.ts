declare module "key-input-elements/lib/event-matcher.js" {
  export default {
    default: typeof KeyboardEventMatcher,
  };
}

declare class KeyboardEventMatcher {
  constructor(key: string);
  test(event: KeyboardEvent): boolean;
  testModInsensitive(event: KeyboardEvent): boolean;
}
