function buildOptimizationHints(registry, target) {
  const entry = registry.resolveAllocation(target);

  if (!entry) {
    return ["Value is not tracked. Use track to enable optimization hints."];
  }

  const hints = [];

  if (entry.kind === "array" && entry.sizeEstimate >= 160) {
    hints.push("This array is relatively large; consider reusing it instead of recreating it repeatedly.");
  }

  if (entry.mutationCount >= 3) {
    hints.push("This tracked value changes often; consider pooling or narrowing the mutation surface.");
  }

  if (entry.inboundRefs.size >= 3) {
    hints.push("This value spans many owners; consider reducing how many scopes or containers retain it.");
  }

  if (entry.kind === "string") {
    const duplicates = registry.findDuplicateScalarValues(entry);
    if (duplicates > 1) {
      hints.push("This string content appears multiple times; consider sharing or reusing the same tracked value.");
    }
  }

  if (entry.kind === "function" && entry.outboundRefs.size >= 2) {
    hints.push("This closure retains multiple captured values; move nonessential state out of the function scope.");
  }

  if (entry.status === "released") {
    hints.push("This value no longer has tracked owners. In compact mode it can be reclaimed aggressively.");
  }

  return hints.length > 0 ? hints : ["No immediate optimization hints."];
}

module.exports = {
  buildOptimizationHints,
};
