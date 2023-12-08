import { FlatCompat } from "@eslint/eslintrc";
import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import parserTs from "@typescript-eslint/parser";
import pluginTs from "@typescript-eslint/eslint-plugin";
import globals from "globals";

const compat = new FlatCompat();

function ts(files, project) {
  return compat
    .extends(
      "plugin:@typescript-eslint/recommended-type-checked",
      "plugin:@typescript-eslint/stylistic-type-checked",
    )
    .map((config) => ({
      ...config,
      files,
      languageOptions: {
        parser: parserTs,
        parserOptions: {
          // https://typescript-eslint.io/packages/typescript-estree/#parsing
          // https://github.com/babel/babel/pull/16029
          allowAutomaticSingleRunInference: true,
          project,
        },
      },
      plugins: { "@typescript-eslint": pluginTs },
      rules: {
        ...config.rules,
        "@typescript-eslint/prefer-namespace-keyword": "off",
      },
    }));
}

export default [
  { ignores: ["{,prod-}build"] },
  js.configs.recommended,
  eslintConfigPrettier,
  ...ts(["src/**/*.ts"], "./src/tsconfig.json"),
  ...ts(["*.ts", "test/**/*.ts"], "./tsconfig.json"),
  {
    files: ["*.config.{js,ts}"],
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
    files: ["test/**/*.test.ts"],
    languageOptions: {
      globals: {
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
