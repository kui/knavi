let handlers;

function initIfRequired() {
  if (handlers) return;
  handlers = new Map();
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const c = handlers.get(message.type);
    console.debug("message=", message, "handlers", c, "location=", location.href);
    if (!c || c.handlers.length === 0) {
      console.debug(" -> ignore");
      return;
    }
    return c.handlers.some(h => h(message, sender, sendResponse));
  });
}

export function sendTo(message, tabId, frameId) {

  return new Promise(resolve => {
    chrome.tabs.sendMessage(tabId, message, frameId == null ? null : { frameId }, resolve);
  });
}
export function send(message) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage(message, resolve);
  });
}

export function recieve(type, handler) {
  initIfRequired();
  if (handlers.has(type)) {
    throw Error("Already register a recievie-handler: type=" + type);
  }
  handlers.set(type, {
    type,
    handlerType: "reciever",
    handlers: [(m, s, r) => {
      handler(m, s, r);
      return true;
    }]
  });
  return () => {
    handlers.delete(type);
  };
}

export function subscribe(type, handler) {

  initIfRequired();

  const c = handlers.get(type) || {
    type,
    handlerType: "subscribers",
    handlers: []
  };
  handlers.set(type, c);
  if (c.handlerType === "reciever") {
    throw Error("Already register a recievie-handler: type=" + type);
  }

  const h = (m, s) => {
    handler(m, s);
    return false;
  };
  c.handlers.push(h);

  return () => {
    const idx = c.handlers.indexOf(h);
    if (idx < 0) {
      console.warn("Already unsubscribed: type=", type);
    } else {
      c.handlers.splice(idx, 1);
    }
  };
}