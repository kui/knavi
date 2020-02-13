const envOptions = {
  targets: {
    // See http://caniuse.com/usage-table
    chrome: "79"
  },
  useBuiltIns: "usage",
  corejs: 3
};

const development = {
  presets: [["@babel/preset-env", envOptions]]
};

const production = {
  presets: [["@babel/preset-env", Object.assign(envOptions, { loose: true })]],
  plugins: [
    [
      "strip-function-call",
      {
        strip: ["console.debug", "console.time", "console.timeEnd"]
      }
    ]
  ]
};

module.exports = Object.assign(development, { env: { production } });
