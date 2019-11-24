module.exports = function(config) {
  config.set({
    mutate: [
      "source/render-component.js",
      "source/riteway.js"
    ],
    mutator: "javascript",
    packageManager: "npm",
    reporters: ["html", "clear-text", "progress"],
    testRunner: "command",
    transpilers: ["babel"],
    coverageAnalysis: "off",
    babel: {
      optionsFile: ".babelrc"
    }
  });
};
