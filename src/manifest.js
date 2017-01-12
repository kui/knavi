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
    persistent: false
  },
  content_scripts: [
    { matches: ["<all_urls>"],
      js: ["content-script.js"],
      run_at: "document_start",
      all_frames: true,
    },
  ],
  content_security_policy: "script-src 'self'; object-src 'self'",
  options_page: "options.html",
  options_ui: {
    page: "options.html",
    chrome_style: true
  },
  permissions: [
    "storage",
    "activeTab",
    "<all_urls>"
  ],
  web_accessible_resources: [
    "*.js.map"
  ]
};
