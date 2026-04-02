const { explainAllocation, summarizeOwners, summarizeReferences } = require("./explainer");
const { buildOptimizationHints } = require("./optimizer");

function inspectValue(registry, target) {
  const entry = registry.resolveAllocation(target);

  if (!entry) {
    return {
      tracked: false,
      message: "Value is not tracked. Wrap it with track to inspect memory.",
    };
  }

  return {
    tracked: true,
    id: entry.id,
    type: entry.typeName,
    kind: entry.kind,
    explicit: entry.explicit,
    status: entry.status,
    ownerScope: entry.ownerScope,
    sizeEstimate: entry.sizeEstimate,
    refs: summarizeReferences(registry, entry),
    owners: summarizeOwners(registry, entry),
    whyAlive: explainAllocation(registry, entry),
    hints: buildOptimizationHints(registry, entry),
  };
}

function summarizeMemory(registry) {
  const liveEntries = registry.listAllocations({ includeReleased: false });
  const hints = [];

  liveEntries.forEach((entry) => {
    buildOptimizationHints(registry, entry).forEach((hint) => {
      if (hint !== "No immediate optimization hints.") {
        hints.push(`${entry.typeName}#${entry.id}: ${hint}`);
      }
    });
  });

  return {
    totalTrackedAllocations: liveEntries.length,
    totalTrackedSize: liveEntries.reduce((total, entry) => total + entry.sizeEstimate, 0),
    largestAllocations: [...liveEntries]
      .sort((left, right) => right.sizeEstimate - left.sizeEstimate)
      .slice(0, 5)
      .map((entry) => ({
        id: entry.id,
        type: entry.typeName,
        sizeEstimate: entry.sizeEstimate,
        status: entry.status,
      })),
    suspectedWaste: registry.findLeaks(),
    optimizationHints: hints,
  };
}

module.exports = {
  inspectValue,
  summarizeMemory,
};
