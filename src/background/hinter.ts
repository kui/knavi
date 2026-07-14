import { Router, sendToTab } from "../lib/chrome-messages";
import { requireTabId } from "./sender-guards";

export const router = Router.newRuntimeInstance()
  .add("AttachHints", async (_msg, sender) => {
    return await sendToTab(
      requireTabId(sender),
      "AttachHintsInTab",
      undefined,
      {
        frameId: 0,
      },
    );
  })
  .add("HitHint", async ({ key }, sender) => {
    return await sendToTab(
      requireTabId(sender),
      "HitHintInTab",
      { key },
      {
        frameId: 0,
      },
    );
  })
  .add("CycleHint", async (_msg, sender) => {
    return await sendToTab(requireTabId(sender), "CycleHintInTab", undefined, {
      frameId: 0,
    });
  })
  .add("RemoveHints", async ({ options, execute }, sender) => {
    return await sendToTab(
      requireTabId(sender),
      "RemoveHintsInTab",
      { options, execute },
      { frameId: 0 },
    );
  });
