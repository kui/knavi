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
}

interface HintedElement extends ElementRects {
  hint: string;
  state: "init" | "candidate" | "hit" | "disabled";
}

interface HintContext {
  targets: HintedElement[];
  inputSequence: string[];
  hitTarget: HintedElement | null;
}

interface ActionDescriptions {
  short: string;
  long?: string;
}
