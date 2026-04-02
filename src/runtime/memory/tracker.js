const { MemoryRegistry } = require("./registry");

function createMemoryRegistry(options = {}) {
  return new MemoryRegistry(options);
}

module.exports = {
  createMemoryRegistry,
};
