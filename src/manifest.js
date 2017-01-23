// @flow
/* eslint-env node */
import pkg from "../package.json";

/* eslint-disable camelcase */
export default {
  manifest_version: 2,
  name: pkg.name,
  version: pkg.version,
  description: pkg.description,
  author: pkg.author,
  icons: {
    "16": "icon16.png",
    "48": "icon48.png",
    "128": "icon128.png",
  },
  background: {
    scripts: ["background.js"],
    persistent: true,
  },
  content_scripts: [
    { matches: ["<all_urls>"],
      js: ["content-script-all.js"],
      run_at: "document_start",
      all_frames: true,
    },
    { matches: ["<all_urls>"],
      js: ["content-script-root.js"],
      run_at: "document_start",
    },
  ],
  content_security_policy: "script-src 'self'; object-src 'self'",
  options_page: "options.html",
  options_ui: {
    page: "options.html",
    // This option page require to be open in a tab,
    // because new option UI style grubs escape key events to close the modal.
    open_in_tab: true,
  },
  permissions: [
    "storage",
    "tabs",
    "activeTab",
    "<all_urls>"
  ],
  web_accessible_resources: [
    "*.js.map"
  ]
};
