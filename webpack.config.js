const DEBUG = process.env.NODE_ENV !== "production";
const webpack = require("webpack");
const BabiliPlugin = require("babili-webpack-plugin");

const plugins = [
  new webpack.optimize.CommonsChunkPlugin({
    name: "content-script-common",
    chunks: ["content-script-root", "content-script-all"],
  }),
];

if (!DEBUG) {
  plugins.push(new BabiliPlugin());
}

module.exports = {
  devtool: DEBUG ? "inline-source-map" : "source-map",
  entry: {
    options: "./src/options.js",
    background: "./src/background.js",
    "content-script-root": "./src/content-script-root.js",
    "content-script-all": "./src/content-script-all.js",
  },
  output: {
    path: "./build",
    filename: "[name].js"
  },
  module: {
    rules: [
      { test: /\.js$/, exclude: /node_modules/, use: "babel-loader" }
    ]
  },
  plugins,
};
