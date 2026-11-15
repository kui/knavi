import { Router, sendToTab } from "../lib/chrome-messages";
import * as framePaths from "./frame-paths";
import { requireFrameId, requireTabId } from "./sender-guards";

export const router = Router.newRuntimeInstance()
  .add("GetFrameId", (_, sender) => requireFrameId(sender))

  .add("ResponseRectsFragment", async (message, sender) => {
    await sendToTab(requireTabId(sender), "ResponseRectsFragment", message, {
      frameId: 0,
    });
  })

  .add("ExecuteAction", async ({ id, options }, sender) => {
    await sendToTab(
      requireTabId(sender),
      "ExecuteActionInFrame",
      { id, options },
      { frameId: id.frameId },
    );
  })

  .add("ReportFramePath", ({ path }, sender) => {
    framePaths.report(requireTabId(sender), path, requireFrameId(sender));
  })

  .add(
    "AllRectsRequest",
    async ({ id, targetPath, viewport, offsets }, sender) => {
      const tabId = requireTabId(sender);
      const frameId = await framePaths.lookup(tabId, targetPath);
      if (frameId == null) {
        console.debug("No frame reported its path as", targetPath);
        return;
      }
      await sendToTab(
        tabId,
        "AllRectsRequest",
        { id, targetPath, viewport, offsets },
        { frameId },
      );
    },
  )

  .add("BlurUp", async ({ path, rect }, sender) => {
    const tabId = requireTabId(sender);
    if (path.length === 0) {
      // INVARIANT: only the top frame has the empty path.
      if (requireFrameId(sender) !== 0) throw Error("Only frame 0 is the top");
      await sendToTab(tabId, "BlurRoot", { rect }, { frameId: 0 });
      return;
    }
    /* WHY: the table only lives during a hint session but blur happens
       outside one, so the parent is found by its path: every frame gets the
       message and only the one with that path handles it. */
    await sendToTab(tabId, "BlurRelay", {
      targetPath: path.slice(0, -1),
      childSegment: path[path.length - 1],
      rect,
    });
  });
