interface ActionOptions {
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

// Identifier for a element in a frame.
interface ElementId {
  index: number;
  frameId: number;
}

interface ElementRects {
  id: ElementId;
  rects: RectJSON<"element-border", "root-viewport">[];
  descriptions: ActionDescriptions;
}

interface HintedElement extends ElementRects {
  hint: string;
  state: "init" | "candidate" | "hit" | "disabled";
}

interface ActionDescriptions {
  short: string;
  long?: string;
}
