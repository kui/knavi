import { FlatCompat } from "@eslint/eslintrc";
import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import parserTs from "@typescript-eslint/parser";
import pluginTs from "@typescript-eslint/eslint-plugin";
import globals from "globals";

const compat = new FlatCompat();

export default [
  { ignores: ["{,prod-}build"] },
  js.configs.recommended,
  eslintConfigPrettier,
  ...compat
    .extends(
      "plugin:@typescript-eslint/recommended-type-checked",
      "plugin:@typescript-eslint/stylistic-type-checked",
    )
    .map((config) => ({
      ...config,
      files: ["src/**/*.ts"],
      languageOptions: {
        parser: parserTs,
        parserOptions: {
          // https://typescript-eslint.io/packages/typescript-estree/#parsing
          // https://github.com/babel/babel/pull/16029
          allowAutomaticSingleRunInference: true,
          project: "./src/tsconfig.json",
        },
      },
      plugins: { "@typescript-eslint": pluginTs },
      rules: {
        ...config.rules,
        "@typescript-eslint/prefer-namespace-keyword": "off",
      },
    })),
  {
    files: ["*.config.js"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ["src/**/*.{js,ts}"],
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
