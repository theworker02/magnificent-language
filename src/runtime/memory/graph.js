function renderMemoryGraph(registry, options = {}) {
  const entries = registry.listAllocations({ includeReleased: options.includeReleased ?? false });

  if (entries.length === 0) {
    return "No tracked allocations.";
  }

  const lines = [];

  entries.forEach((entry) => {
    lines.push(`${entry.typeName}#${entry.id} [${entry.status}, size=${entry.sizeEstimate}]`);

    if (entry.inboundRefs.size === 0) {
      lines.push("  <- released");
    } else {
      entry.inboundRefs.forEach((reference) => {
        if (reference.kind === "root") {
          lines.push(`  <- root ${reference.scopeName}.${reference.name}`);
        } else if (reference.kind === "watcher") {
          lines.push(`  <- watcher ${reference.label}`);
        } else {
          const ownerEntry = registry.allocations.get(reference.ownerId);
          lines.push(`  <- ${ownerEntry ? `${ownerEntry.typeName}#${ownerEntry.id}` : "unknown"} via ${reference.reason}`);
        }
      });
    }

    entry.outboundRefs.forEach((reference) => {
      const targetEntry = registry.allocations.get(reference.targetId);
      if (targetEntry) {
        lines.push(`  -> ${targetEntry.typeName}#${targetEntry.id} via ${reference.reason}`);
      }
    });
  });

  return lines.join("\n");
}

module.exports = {
  renderMemoryGraph,
};
