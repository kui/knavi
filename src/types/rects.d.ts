type CoordinateType =
  | "layout-viewport"
  // Layout Viewport of current frame cropped by ancestor frames.
  | "actual-viewport"
  // Layout Viewport of the root frame that is browser's frame.
  | "root-viewport"
  // content area of <html>.
  // https://developer.mozilla.org/en-US/docs/Web/CSS/Containing_block#:~:text=rectangle%20called%20the-,initial%20containing%20block,-.%20It%20has%20the
  | "initial-containing-block"
  // Border area of element css box.
  // https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_box_model/Introduction_to_the_CSS_box_model#border_area
  | "element-border"
  // Padding area of element css box.
  // https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_box_model/Introduction_to_the_CSS_box_model#padding_area
  | "element-padding"
  // Content area of element css box.
  // https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_box_model/Introduction_to_the_CSS_box_model#content_area
  | "element-content"
  // Used for document.elementFromPoint.
  | "point";

interface CoordinatesJSON<
  Type extends CoordinateType,
  Origin extends CoordinateType,
> {
  type: Type;
  origin: Origin;
  x: number;
  y: number;
}

interface Sizes {
  width: number;
  height: number;
}

interface RectJSON<Type extends CoordinateType, Origin extends CoordinateType>
  extends CoordinatesJSON<Type, Origin>,
    Sizes {}
