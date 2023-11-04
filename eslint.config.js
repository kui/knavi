const eslintConfigPrettier = require("eslint-config-prettier");
const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  {
    ignores: ["build/**/*.js"],
  },
  js.configs.recommended,
  eslintConfigPrettier,
  {
    files: ["*.config.js"],
    languageOptions: {
      ecmaVersion: "latest",
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ["src/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.webextensions,
      },
    },
  },
  {
    files: ["test/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.mocha,
        ...globals.node,
      },
    },
  },
  {
    files: ["scripts/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
];
