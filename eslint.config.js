import eslintConfigPrettier from "eslint-config-prettier";
import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["{,prod-}build"] },
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
