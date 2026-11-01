import type { Pkg } from "../types/npm";

export default function manifest(pkg: Pkg): chrome.runtime.ManifestV3 {
  return {
    manifest_version: 3,
    name: pkg.name,
    version: pkg.version,
    description: pkg.description,
    minimum_chrome_version: "119",
    icons: {
      16: "icon16.png",
      48: "icon48.png",
      128: "icon128.png",
    },
    background: {
      service_worker: "background.js",
    },
    content_scripts: [
      {
        matches: ["<all_urls>"],
        js: ["content-all.js"],
        run_at: "document_start",
        all_frames: true,
        /* WHY: without this, frames with no URL origin of their own (src-less
           about:blank, srcdoc, data:, blob:) get no content script, so their
           contents never get hints. E.g. the Hatena Bookmark button iframe. */
        match_origin_as_fallback: true,
      },
      {
        matches: ["<all_urls>"],
        js: ["content-root.js"],
        run_at: "document_start",
      },
    ],
    content_security_policy: {
      extension_pages: "default-src 'self'",
    },
    options_ui: {
      page: "options.html",
      /* WHY: Open as a full tab, not embedded in chrome://extensions: the embedded
         dialog closes on Esc, which conflicts with configuring keys like Esc. */
      open_in_tab: true,
    },
    action: {
      default_popup: "popup.html",
      default_icon: {
        16: "icon16.png",
        48: "icon48.png",
        128: "icon128.png",
      },
    },
    permissions: ["storage"],
    host_permissions: ["<all_urls>"],
  };
}
