const path = require("path");
const DEBUG = process.env.NODE_ENV !== "production";
const DEST = path.resolve(__dirname, process.env.DEST || "./build");

module.exports = {
  mode: DEBUG ? "development" : "production",
  devtool: DEBUG ? "inline-source-map" : "source-map",
  entry: {
    options: "./src/options.js",
    background: "./src/background.js",
    "content-script-root": "./src/content-script-root.js",
    "content-script-all": "./src/content-script-all.js"
  },
  output: {
    path: DEST,
    filename: "[name].js"
  },
  module: {
    rules: [
      { test: /\.m?js$/, exclude: /node_modules/, loader: "babel-loader" }
    ]
  }
};
