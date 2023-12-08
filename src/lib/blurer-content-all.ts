import { postMessageTo } from "./dom-messages";
import { getContentRects } from "./elements";
import { filter, first } from "./iters";
import { Rect } from "./rects";

export class BlurerContentAll {
  // Just propergate the message to the parent frame until root frame.
  handleBlurMessage(
    source: MessageEventSource | null,
    rectJson: RectJSON<"element-border", "layout-viewport"> | null,
  ) {
    if (!source) {
      console.warn("Unexpected event source: ", source);
      return;
    }

    if (source === window)
      // Do nothing if the message was sent from the root frame.
      // See blurer-content-root.ts
      return;

    const rect = buildBlurRect(source, rectJson);
    postMessageTo(parent, "com.github.kui.knavi.Blur", { rect });
  }
}

function buildBlurRect(
  source: MessageEventSource,
  // This "Origin" is child frame's viewport.
  originRectJson: RectJSON<"element-border", "layout-viewport"> | null,
): Rect<"element-border", "layout-viewport"> | null {
  if (!originRectJson) {
    console.warn("Unexpected origin rect: ", originRectJson);
    return null;
  }

  const sourceIframe = first(
    filter(
      document.getElementsByTagName("iframe"),
      (i) => source === i.contentWindow,
    ),
  );
  if (!sourceIframe) {
    console.warn("Blur target is not an iframe", source);
    return null;
  }
  const sourceViewport = getContentRects(sourceIframe)[0];
  if (!sourceViewport) {
    console.warn("No viewport: ", sourceIframe);
    return null;
  }

  // We can treat the source frame viewport as its content area.
  const originRect = new Rect({
    ...originRectJson,
    origin: "element-content",
  });

  return originRect.offsets(sourceViewport.reverse());
}
