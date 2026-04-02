function explainAllocation(registry, target) {
  const entry = registry.resolveAllocation(target);

  if (!entry) {
    return "Value is not tracked. Wrap it with track to inspect memory.";
  }

  const paths = collectPathsToRoots(registry, entry.id);

  if (paths.length === 0) {
    return `Allocation #${entry.id} (${entry.typeName}) is not currently alive through any tracked owners.`;
  }

  const lines = [
    `Allocation #${entry.id} (${entry.typeName}) is still alive because:`,
    ...paths.map((path) => `- ${path}`),
  ];

  return lines.join("\n");
}

function collectPathsToRoots(registry, allocationId, visited = new Set()) {
  if (visited.has(allocationId)) {
    return [];
  }

  visited.add(allocationId);
  const entry = registry.allocations.get(allocationId);
  if (!entry) {
    return [];
  }

  const lines = [];

  for (const reference of entry.inboundRefs.values()) {
    if (reference.kind === "root") {
      lines.push(`referenced by variable '${reference.name}' in scope '${reference.scopeName}'`);
      continue;
    }

    if (reference.kind === "watcher") {
      lines.push(`watched by memory watcher '${reference.label}'`);
      continue;
    }

    if (reference.kind === "ownership" && reference.ownerId) {
      const ownerEntry = registry.allocations.get(reference.ownerId);
      const ownerLabel = ownerEntry ? formatAllocationLabel(ownerEntry) : `allocation #${reference.ownerId}`;
      const parentPaths = collectPathsToRoots(registry, reference.ownerId, new Set(visited));

      if (parentPaths.length === 0) {
        lines.push(`stored via ${reference.reason} in ${ownerLabel}`);
      } else {
        parentPaths.forEach((path) => {
          lines.push(`${path}, then retained via ${reference.reason} in ${ownerLabel}`);
        });
      }
    }
  }

  return Array.from(new Set(lines));
}

function summarizeOwners(registry, target) {
  const entry = registry.resolveAllocation(target);
  if (!entry) {
    return ["untracked"];
  }

  const owners = [];
  for (const reference of entry.inboundRefs.values()) {
    if (reference.kind === "root") {
      owners.push(`variable '${reference.name}' in scope '${reference.scopeName}'`);
    } else if (reference.kind === "watcher") {
      owners.push(`watcher '${reference.label}'`);
    } else if (reference.kind === "ownership") {
      const ownerEntry = registry.allocations.get(reference.ownerId);
      owners.push(ownerEntry ? `${formatAllocationLabel(ownerEntry)} via ${reference.reason}` : reference.reason);
    }
  }

  return owners.length > 0 ? owners : ["released"];
}

function summarizeReferences(registry, target) {
  const entry = registry.resolveAllocation(target);
  if (!entry) {
    return [];
  }

  return Array.from(entry.inboundRefs.values()).map((reference) => {
    if (reference.kind === "root") {
      return {
        kind: "root",
        label: `variable '${reference.name}'`,
        scope: reference.scopeName,
      };
    }

    if (reference.kind === "watcher") {
      return {
        kind: "watcher",
        label: reference.label,
      };
    }

    const ownerEntry = registry.allocations.get(reference.ownerId);
    return {
      kind: "ownership",
      label: ownerEntry ? formatAllocationLabel(ownerEntry) : `allocation #${reference.ownerId}`,
      via: reference.reason,
    };
  });
}

function formatAllocationLabel(entry) {
  return `${entry.typeName}#${entry.id}`;
}

module.exports = {
  explainAllocation,
  summarizeOwners,
  summarizeReferences,
};
