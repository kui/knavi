declare interface ShadowRoot extends DocumentFragment {
  elementFromPoint(x: number, y: number): HTMLElement;
}

declare class HTMLMapElement extends HTMLElement {
  name: string;
}

declare class HTMLAreaElement extends HTMLElement {
  coords: string;
  shape: string;
}
