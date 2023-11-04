const envOptions = {
  targets: {
    // See https://browsersl.ist/#q=Chrome+%3E+100
    chrome: "100",
  },
  useBuiltIns: "usage",
  corejs: 3,
};

// Config for dev
const development = {
  presets: [["@babel/preset-env", envOptions]],
};

// Config for release package
const production = {
  presets: [["@babel/preset-env", Object.assign(envOptions, { loose: true })]],
  plugins: [
    [
      "strip-function-call",
      {
        strip: ["console.debug", "console.time", "console.timeEnd"],
      },
    ],
  ],
};

module.exports = Object.assign(development, { env: { production } });
