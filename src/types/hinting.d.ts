interface ActionOptions {
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

interface Coordinates {
  x: number;
  y: number;
}

interface Sizes {
  width: number;
  height: number;
}

type Rect = Coordinates & Sizes;

interface RectHolder {
  index: number;
  frameId: number;
  // The rects are relative to ***
  // TODO Write the ***
  rects: Rect[];
}

interface AllRectsRequest {
  type: typeof ALL_RECTS_REQUEST_TYPE;
  viewport: Rect;
  offsets: Coordinates;
  clientFrameId: number;
}

interface HintTarget {
  holder: RectHolder;
  hint: string;
  state: "init" | "candidate" | "hit" | "disabled";
}

interface HintTargetChange {
  target: HintTarget;
  oldState: HintTarget["state"];
  newState: HintTarget["state"];
}

interface HintContext {
  targets: HintTarget[];
  inputSequence: string[];
  hitTarget: HintTarget | null;
}

interface ActionDescriptions {
  short: string;
  long?: string;
}
