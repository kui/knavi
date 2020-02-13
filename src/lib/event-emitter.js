

export class EventEmitter {

  constructor() {
    this.listeners = [];
  }

  async emit(value) {
    await Promise.all(this.listeners.map(async l => {
      l.callback(value);
    }));
  }

  listen(callback) {
    return new EventListener(this, callback);
  }
}

export class EventListener {

  constructor(eventEmitter, callback) {
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