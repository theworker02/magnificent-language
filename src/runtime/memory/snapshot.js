function captureSnapshot(registry, name = null) {
  const liveEntries = registry.listAllocations({ includeReleased: false });
  const releasedEntries = registry.listAllocations({ includeReleased: true }).filter((entry) => entry.status !== "live");
  const typeDistribution = {};

  liveEntries.forEach((entry) => {
    typeDistribution[entry.typeName] = (typeDistribution[entry.typeName] || 0) + 1;
  });

  return {
    name,
    capturedAtTick: registry.tick,
    allocationCount: liveEntries.length,
    releasedCount: releasedEntries.length,
    totalTrackedSize: liveEntries.reduce((total, entry) => total + entry.sizeEstimate, 0),
    typeDistribution,
    liveAllocationIds: liveEntries.map((entry) => entry.id),
  };
}

function compareSnapshots(before, after) {
  const typeDelta = {};
  const allTypes = new Set([
    ...Object.keys(before.typeDistribution || {}),
    ...Object.keys(after.typeDistribution || {}),
  ]);

  allTypes.forEach((typeName) => {
    typeDelta[typeName] = (after.typeDistribution?.[typeName] || 0) - (before.typeDistribution?.[typeName] || 0);
  });

  return {
    from: before.name || "snapshot-a",
    to: after.name || "snapshot-b",
    allocationDelta: (after.allocationCount || 0) - (before.allocationCount || 0),
    releasedDelta: (after.releasedCount || 0) - (before.releasedCount || 0),
    sizeDelta: (after.totalTrackedSize || 0) - (before.totalTrackedSize || 0),
    typeDelta,
  };
}

module.exports = {
  captureSnapshot,
  compareSnapshots,
};
