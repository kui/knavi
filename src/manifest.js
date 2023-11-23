export default function (pkg) {
  return {
    manifest_version: 2,
    name: pkg.name,
    version: pkg.version,
    description: pkg.description,
    author: pkg.author,
    icons: {
      16: "icon16.png",
      48: "icon48.png",
      128: "icon128.png",
    },
    background: {
      scripts: ["background.js"],
      persistent: true,
    },
    content_scripts: [
      {
        matches: ["<all_urls>"],
        js: ["content-all.js"],
        run_at: "document_start",
        all_frames: true,
      },
      {
        matches: ["<all_urls>"],
        js: ["content-root.js"],
        run_at: "document_start",
      },
    ],
    content_security_policy: "script-src 'self'; object-src 'self'",
    options_page: "options.html",
    options_ui: {
      page: "options.html",
      // The option page requires to be open in a tab,
      // because new option UI style grubs escape key events to close the modal.
      open_in_tab: true,
    },
    permissions: [
      // To store configs.
      "storage",
      // To insert hints for all sites.
      "<all_urls>",
    ],
    web_accessible_resources: ["*.js.map"],
  };
}
