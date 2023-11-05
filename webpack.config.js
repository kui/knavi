import path from "node:path";
import { fileURLToPath } from "node:url";

const DIRNAME = path.dirname(fileURLToPath(import.meta.url));
const DEBUG = process.env.NODE_ENV !== "production";
const DEST = path.resolve(DIRNAME, process.env.DEST || "build");

export default {
  mode: DEBUG ? "development" : "production",
  devtool: DEBUG ? "inline-source-map" : "source-map",
  entry: {
    options: "./src/options.js",
    background: "./src/background.ts",
    "content-script-root": "./src/content-script-root.js",
    "content-script-all": "./src/content-script-all.js",
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
};
