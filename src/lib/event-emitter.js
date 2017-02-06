// @flow

declare type Callback<T> = (value: T) => void;

export class EventEmitter<T> {
  listeners: Array<EventListener<T>>;

  constructor() {
    this.listeners = [];
  }

  async emit(value: T) {
    await Promise.all(this.listeners.map(async (l) => {
      l.callback(value);
    }));
  }

  listen(callback: Callback<T>): EventListener<T> {
    return new EventListener(this, callback);
  }
}

export class EventListener<T> {
  eventEmitter: EventEmitter<T>;
  callback: Callback<T>;

  constructor(eventEmitter: EventEmitter<T>, callback: Callback<T>) {
    this.eventEmitter = eventEmitter;
    this.callback = callback;
    this.eventEmitter.listeners.push(this);
  }

  stop() {
    const i = this.eventEmitter.listeners.indexOf(this);
    if (i >= 0) throw Error("Illegal state: already stopped");
    this.eventEmitter.listeners.splice(i, 1);
  }
}
