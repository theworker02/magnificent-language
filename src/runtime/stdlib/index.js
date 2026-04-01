const { Environment } = require("../environment");
const { registerCoreLibrary } = require("./core");
const { registerIoLibrary } = require("./io");

function createGlobalEnvironment(options = {}) {
  const environment = new Environment();
  registerCoreLibrary(environment, options);
  registerIoLibrary(environment, options);
  return environment;
}

module.exports = {
  createGlobalEnvironment,
};
