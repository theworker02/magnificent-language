const { renderMemoryGraph, summarizeMemory } = require("../runtime/memory");

function renderMemorySummary(registry) {
  const summary = summarizeMemory(registry);
  const lines = [
    "Memory Summary",
    `Total tracked allocations: ${summary.totalTrackedAllocations}`,
    `Total tracked size: ${summary.totalTrackedSize}`,
    "",
    "Largest allocations:",
  ];

  if (summary.largestAllocations.length === 0) {
    lines.push("  none");
  } else {
    summary.largestAllocations.forEach((entry) => {
      lines.push(`  #${entry.id} ${entry.type} size=${entry.sizeEstimate} status=${entry.status}`);
    });
  }

  lines.push("");
  lines.push("Optimization hints:");

  if (summary.optimizationHints.length === 0) {
    lines.push("  none");
  } else {
    summary.optimizationHints.slice(0, 8).forEach((hint) => {
      lines.push(`  - ${hint}`);
    });
  }

  return lines.join("\n");
}

function renderLiveAllocations(registry) {
  const entries = registry.listAllocations({ includeReleased: false });

  if (entries.length === 0) {
    return "No live tracked allocations.";
  }

  return [
    "Live Allocations",
    ...entries.map((entry) => `#${entry.id} ${entry.typeName} refs=${entry.inboundRefs.size} size=${entry.sizeEstimate}`),
  ].join("\n");
}

function renderLeakReport(registry) {
  const leaks = registry.findLeaks();

  if (leaks.length === 0) {
    return "No suspicious long-lived allocations found.";
  }

  return [
    "Potential Long-Lived Allocations",
    ...leaks.map((entry) => `#${entry.id} ${entry.type} refs=${entry.refs} ${entry.reason}`),
  ].join("\n");
}

module.exports = {
  renderLiveAllocations,
  renderLeakReport,
  renderMemoryGraph,
  renderMemorySummary,
};
