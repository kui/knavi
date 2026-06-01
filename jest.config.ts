import type { JestConfigWithTsJest } from "ts-jest";

const config: JestConfigWithTsJest = {
  testEnvironment: "node",
  testMatch: ["<rootDir>/test/**/*.test.ts"],
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      // The project is an ESM package ("type": "module"), but Jest runs the
      // transformed code as CommonJS, so emit CommonJS from ts-jest.
      { tsconfig: { module: "CommonJS" } },
    ],
  },
};
export default config;
