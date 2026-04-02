const { explainAllocation, summarizeOwners, summarizeReferences } = require("./explainer");
const { renderMemoryGraph } = require("./graph");
const { inspectValue, summarizeMemory } = require("./inspector");
const { buildOptimizationHints } = require("./optimizer");
const { MemoryRegistry } = require("./registry");
const { captureSnapshot, compareSnapshots } = require("./snapshot");
const { createMemoryRegistry } = require("./tracker");

module.exports = {
  MemoryRegistry,
  buildOptimizationHints,
  captureSnapshot,
  compareSnapshots,
  createMemoryRegistry,
  explainAllocation,
  inspectValue,
  renderMemoryGraph,
  summarizeMemory,
  summarizeOwners,
  summarizeReferences,
};
