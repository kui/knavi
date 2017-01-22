const DEBUG = process.env.NODE_ENV !== "production";
const webpack = require("webpack");
const BabiliPlugin = require("babili-webpack-plugin");

const plugins = [
  new webpack.optimize.DedupePlugin(),
  new webpack.optimize.OccurrenceOrderPlugin(),
];

if (!DEBUG) {
  plugins.push(new BabiliPlugin());
}

module.exports = {
  debug: DEBUG,
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
    loaders: [
      { test: /\.js$/, exclude: /node_modules/, loader: "babel-loader" }
    ]
  },
  plugins,
};
