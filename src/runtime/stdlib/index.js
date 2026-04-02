const { Environment } = require("../environment");
const { registerCoreLibrary } = require("./core");
const { registerIoLibrary } = require("./io");
const { registerMemoryLibrary } = require("./memory");

function createGlobalEnvironment(options = {}) {
  const environment = new Environment(null, {
    registry: options.memoryRegistry || null,
    scopeName: options.scopeName || "global",
    scopeKind: "global",
  });
  registerCoreLibrary(environment, options);
  registerIoLibrary(environment, options);
  registerMemoryLibrary(environment, options);
  return environment;
}

module.exports = {
  createGlobalEnvironment,
};
