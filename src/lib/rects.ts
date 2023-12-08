import { map } from "./iters";

export class Coordinates<
  Type extends CoordinateType,
  Origin extends CoordinateType,
> implements CoordinatesJSON<Type, Origin>
{
  readonly type: Type;
  readonly origin: Origin;
  readonly x: number;
  readonly y: number;

  constructor(json: CoordinatesJSON<Type, Origin>) {
    this.type = json.type;
    this.origin = json.origin;
    this.x = json.x;
    this.y = json.y;
  }

  offsets<NewOrigin extends CoordinateType>(
    c: Coordinates<NewOrigin, Origin>,
  ): Coordinates<Type, NewOrigin> {
    return new Coordinates({
      type: this.type,
      origin: c.type,
      x: this.x - c.x,
      y: this.y - c.y,
    });
  }

  reverse(): Coordinates<Origin, Type> {
    return new Coordinates({
      type: this.origin,
      origin: this.type,
      x: -this.x,
      y: -this.y,
    });
  }
}

// Indicates Rect that is relative to the origin.
// The coordinates (x, y) indicate the top-left corner of the rect.
export class Rect<Type extends CoordinateType, Origin extends CoordinateType>
  extends Coordinates<Type, Origin>
  implements RectJSON<Type, Origin>
{
  readonly width: number;
  readonly height: number;

  constructor(json: RectJSON<Type, Origin>) {
    super(json);
    this.width = json.width;
    this.height = json.height;
  }

  static intersectionWithSameType<
    Type extends CoordinateType,
    Origin extends CoordinateType,
  >(...rects: RectJSON<Type, Origin>[]): Rect<Type, Origin> | null {
    if (rects.length === 0) return null;
    return Rect.intersection(rects[0].type, ...rects);
  }

  // Returns null if the rects don't intersect.
  static intersection<
    Type extends CoordinateType,
    Origin extends CoordinateType,
  >(
    type: Type,
    ...rects: RectJSON<CoordinateType, Origin>[]
  ): Rect<Type, Origin> | null {
    if (rects.length === 0) return null;

    const domRects = rects.map((r) => DOMRectReadOnly.fromRect(r));
    const left = Math.max(...map(domRects, (r) => r.left));
    const right = Math.min(...map(domRects, (r) => r.right));
    const top = Math.max(...map(domRects, (r) => r.top));
    const bottom = Math.min(...map(domRects, (r) => r.bottom));

    if (left >= right || top >= bottom) return null;
    return new Rect({
      type,
      origin: rects[0].origin,
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    });
  }

  static boundRects<Type extends CoordinateType, Origin extends CoordinateType>(
    ...rects: RectJSON<Type, Origin>[]
  ): Rect<Type, Origin> {
    if (rects.length === 0) throw new Error("rects must not be empty");

    const domRects = rects.map((r) => DOMRectReadOnly.fromRect(r));
    const left = Math.min(...map(domRects, (r) => r.left));
    const right = Math.max(...map(domRects, (r) => r.right));
    const top = Math.min(...map(domRects, (r) => r.top));
    const bottom = Math.max(...map(domRects, (r) => r.bottom));

    return new Rect({
      type: rects[0].type,
      origin: rects[0].origin,
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    });
  }

  offsets<NewOrigin extends CoordinateType>(
    c: CoordinatesJSON<NewOrigin, Origin>,
  ): Rect<Type, NewOrigin> {
    return new Rect({
      type: this.type,
      origin: c.type,
      x: this.x - c.x,
      y: this.y - c.y,
      width: this.width,
      height: this.height,
    });
  }

  reverse(): Rect<Origin, Type> {
    return new Rect({
      type: this.origin,
      origin: this.type,
      x: -this.x,
      y: -this.y,
      width: this.width,
      height: this.height,
    });
  }

  // Resize the rect by the given sides.
  // Positive value means expanding the rect.
  // Negative value means shrinking the rect.
  resize(
    arg:
      | {
          top: number;
          right: number;
          bottom: number;
          left: number;
        }
      | number,
  ): Rect<Type, Origin> {
    let edges: { top: number; right: number; bottom: number; left: number };
    if (typeof arg === "number") {
      edges = { top: arg, right: arg, bottom: arg, left: arg };
    } else {
      edges = arg;
    }
    return new Rect({
      type: this.type,
      origin: this.origin,
      x: this.x - edges.left,
      y: this.y - edges.top,
      width: this.width + edges.left + edges.right,
      height: this.height + edges.top + edges.bottom,
    });
  }
}
