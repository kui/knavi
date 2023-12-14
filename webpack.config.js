import path from "node:path";
import { fileURLToPath } from "node:url";

const DIRNAME = path.dirname(fileURLToPath(import.meta.url));
const DEBUG = process.env.NODE_ENV !== "production";
const DEST = path.resolve(DIRNAME, process.env.DEST || "build/dev");

export default {
  mode: DEBUG ? "development" : "production",
  devtool: "source-map",
  entry: {
    options: "./src/options.js",
    background: "./src/background.ts",
    "content-root": "./src/content-root.ts",
    "content-all": "./src/content-all.ts",
  },
  output: {
    path: DEST,
    filename: "[name].js",
  },
  module: {
    rules: [
      { test: /\.(js|ts)$/, exclude: /node_modules/, loader: "babel-loader" },
    ],
  },
  resolve: {
    extensions: [".ts", ".js"],
  },
};
