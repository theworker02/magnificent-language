const {
  MglClass,
  MglFunction,
  MglInstance,
  MglModule,
  MglRecordInstance,
  MglRecordType,
  MglTrackedScalar,
  NativeFunction,
  unwrapRuntimeValue,
} = require("../values");
const { describeRuntimeType } = require("../types");
const { buildOptimizationHints } = require("./optimizer");

class MemoryRegistry {
  constructor(options = {}) {
    this.stdout = options.stdout || process.stdout;
    this.mode = options.memoryMode || "balanced";
    this.trackAllocations = options.trackAllocations ?? false;
    this.memoryWarnings = options.memoryWarnings ?? false;
    this.explainOwnership = options.explainOwnership ?? true;
    this.snapshotOnExit = options.snapshotOnExit ?? false;
    this.allocations = new Map();
    this.objectIds = new WeakMap();
    this.scalarValues = new Map();
    this.rootRefs = new Map();
    this.tick = 0;
    this.nextAllocationId = 0;
  }

  trackExplicitValue(value, meta = {}) {
    const prepared = this.prepareExplicitValue(value);
    return this.trackValue(prepared, { ...meta, explicit: true });
  }

  prepareExplicitValue(value) {
    if (value instanceof MglTrackedScalar) {
      return value;
    }

    const rawValue = unwrapRuntimeValue(value);
    if (rawValue === null || rawValue === undefined) {
      return value;
    }

    if (typeof rawValue === "string" || typeof rawValue === "number" || typeof rawValue === "boolean") {
      return new MglTrackedScalar(rawValue);
    }

    return value;
  }

  trackValue(value, meta = {}) {
    if (value === null || value === undefined) {
      return value;
    }

    const rawValue = unwrapRuntimeValue(value);
    const existing = this.getAllocation(value);

    if (existing) {
      if (meta.explicit) {
        existing.explicit = true;
      }
      return value;
    }

    if (!meta.explicit && !this.shouldAutoTrackValue(value, meta)) {
      return value;
    }

    const allocationId = this.nextAllocationId + 1;
    const entry = {
      id: allocationId,
      explicit: Boolean(meta.explicit),
      kind: this.detectKind(value),
      typeName: describeRuntimeType(value),
      ownerScope: meta.scopeName || null,
      sizeEstimate: estimateSize(value),
      createdAtTick: ++this.tick,
      touchedAtTick: this.tick,
      status: "live",
      inboundRefs: new Map(),
      outboundRefs: new Map(),
      mutationCount: 0,
      watched: false,
      watchLabel: null,
      filePath: meta.filePath || null,
      reasons: meta.reason ? [meta.reason] : [],
    };

    this.allocations.set(allocationId, entry);
    this.objectIds.set(value, allocationId);
    if (value instanceof MglTrackedScalar) {
      this.scalarValues.set(allocationId, value.value);
    }
    this.nextAllocationId = allocationId;
    this.syncRelationships(value);
    return value;
  }

  shouldAutoTrackValue(value, meta = {}) {
    if (meta.explicit) {
      return true;
    }

    if (value instanceof MglTrackedScalar) {
      return true;
    }

    if (this.mode === "performance") {
      return false;
    }

    if (this.trackAllocations) {
      return isTrackableValue(value);
    }

    if (this.mode === "debug-memory") {
      return isTrackableValue(value);
    }

    return false;
  }

  setRootReference(scope, name, value, binding = {}) {
    const key = `${scope.id}:${name}`;
    this.removeRootReference(key);

    if (binding.source === "stdlib") {
      return;
    }

    const trackedValue = this.trackValue(value, {
      scopeName: scope.scopeName,
      reason: `bound to ${scope.scopeName}.${name}`,
    });
    const entry = this.getAllocation(trackedValue);

    if (!entry) {
      return;
    }

    this.rootRefs.set(key, {
      allocationId: entry.id,
      scopeId: scope.id,
      scopeName: scope.scopeName,
      name,
    });

    entry.inboundRefs.set(key, {
      kind: "root",
      scopeId: scope.id,
      scopeName: scope.scopeName,
      name,
    });

    entry.status = "live";
    this.touch(entry);
    this.emitWatch(entry, `root ${scope.scopeName}.${name} now retains allocation #${entry.id}`);
  }

  removeRootReference(key) {
    const existing = this.rootRefs.get(key);
    if (!existing) {
      return;
    }

    this.rootRefs.delete(key);
    const entry = this.allocations.get(existing.allocationId);
    if (!entry) {
      return;
    }

    entry.inboundRefs.delete(key);
    this.refreshStatus(entry);
    this.emitWatch(entry, `root ${existing.scopeName}.${existing.name} released allocation #${entry.id}`);
  }

  clearScope(scopeId) {
    for (const [key, reference] of Array.from(this.rootRefs.entries())) {
      if (reference.scopeId === scopeId) {
        this.removeRootReference(key);
      }
    }
  }

  markMutation(value, reason) {
    const entry = this.getAllocation(value);
    if (!entry) {
      return;
    }

    entry.mutationCount += 1;
    entry.reasons.push(reason);
    this.touch(entry);
    this.syncRelationships(value);
    this.emitWatch(entry, `${formatAllocation(entry)} mutated: ${reason}`);
  }

  watchValue(value, label = null) {
    const trackedValue = this.trackExplicitValue(value, {
      reason: label ? `watched as ${label}` : "watched",
    });
    const entry = this.getAllocation(trackedValue);

    if (!entry) {
      return null;
    }

    entry.watched = true;
    entry.watchLabel = label || `${entry.typeName}#${entry.id}`;
    entry.inboundRefs.set(`watcher:${entry.id}`, {
      kind: "watcher",
      label: entry.watchLabel,
    });
    return entry;
  }

  syncRelationships(value) {
    const entry = this.getAllocation(value);
    if (!entry) {
      return;
    }

    Array.from(entry.outboundRefs.keys()).forEach((key) => {
      const outbound = entry.outboundRefs.get(key);
      const targetEntry = this.allocations.get(outbound.targetId);
      if (targetEntry) {
        targetEntry.inboundRefs.delete(key);
        this.refreshStatus(targetEntry);
      }
      entry.outboundRefs.delete(key);
    });

    collectChildren(value).forEach((child) => {
      const trackedChild = this.trackValue(child.value, {
        scopeName: entry.ownerScope,
        reason: `${formatAllocation(entry)} owns ${child.reason}`,
      });
      const childEntry = this.getAllocation(trackedChild);

      if (!childEntry) {
        return;
      }

      const key = `${entry.id}:${child.key}`;
      entry.outboundRefs.set(key, {
        key,
        targetId: childEntry.id,
        reason: child.reason,
      });
      childEntry.inboundRefs.set(key, {
        kind: "ownership",
        ownerId: entry.id,
        reason: child.reason,
      });
      childEntry.status = "live";
      this.touch(childEntry);
    });

    this.refreshStatus(entry);
  }

  getAllocation(target) {
    if (target === null || target === undefined) {
      return null;
    }

    const allocationId = this.objectIds.get(target);
    return allocationId ? this.allocations.get(allocationId) || null : null;
  }

  resolveAllocation(target) {
    if (target && typeof target === "object" && typeof target.id === "number" && this.allocations.has(target.id)) {
      return this.allocations.get(target.id);
    }

    return this.getAllocation(target);
  }

  getAllocationId(target) {
    const entry = this.getAllocation(target);
    return entry ? entry.id : null;
  }

  listAllocations(options = {}) {
    const includeReleased = options.includeReleased ?? false;
    return Array.from(this.allocations.values())
      .filter((entry) => includeReleased || entry.status === "live")
      .sort((left, right) => left.id - right.id);
  }

  traceAllocations() {
    return this.listAllocations({ includeReleased: true }).map((entry) => ({
      id: entry.id,
      type: entry.typeName,
      kind: entry.kind,
      explicit: entry.explicit,
      status: entry.status,
      sizeEstimate: entry.sizeEstimate,
      refs: entry.inboundRefs.size,
      hints: buildOptimizationHints(this, entry),
    }));
  }

  findLeaks() {
    return this.listAllocations({ includeReleased: false })
      .filter((entry) => entry.explicit || entry.inboundRefs.size >= 2 || entry.createdAtTick < this.tick - 3)
      .map((entry) => ({
        id: entry.id,
        type: entry.typeName,
        refs: entry.inboundRefs.size,
        status: entry.status,
        reason: entry.inboundRefs.size >= 2
          ? "retained by multiple owners"
          : entry.explicit
            ? "explicitly tracked and still live"
            : "survived across multiple runtime ticks",
      }));
  }

  findDuplicateScalarValues(targetEntry) {
    if (!targetEntry || targetEntry.kind !== "string") {
      return 0;
    }

    const value = this.getTrackedScalarValue(targetEntry.id);
    if (typeof value !== "string") {
      return 0;
    }

    return this.listAllocations({ includeReleased: false })
      .filter((entry) => entry.kind === "string" && this.getTrackedScalarValue(entry.id) === value)
      .length;
  }

  getTrackedScalarValue(allocationId) {
    return this.scalarValues.get(allocationId) ?? null;
  }

  touch(entry) {
    entry.touchedAtTick = ++this.tick;
  }

  refreshStatus(entry) {
    if (entry.inboundRefs.size === 0) {
      entry.status = this.mode === "compact" ? "compacted" : "released";
    } else {
      entry.status = "live";
    }
  }

  emitWatch(entry, message) {
    if (!entry.watched) {
      return;
    }

    if (this.mode === "debug-memory" || this.memoryWarnings) {
      this.stdout.write(`[memory-watch] ${message}\n`);
    }
  }

  detectKind(value) {
    const rawValue = unwrapRuntimeValue(value);

    if (value instanceof MglTrackedScalar) {
      return typeof value.value === "string" ? "string" : typeof value.value;
    }

    if (Array.isArray(rawValue)) {
      return "array";
    }

    if (rawValue instanceof MglInstance) {
      return "instance";
    }

    if (rawValue instanceof MglRecordInstance) {
      return "record";
    }

    if (rawValue instanceof MglModule) {
      return "module";
    }

    if (rawValue instanceof MglFunction || rawValue instanceof NativeFunction) {
      return "function";
    }

    if (rawValue instanceof MglClass) {
      return "class";
    }

    if (rawValue instanceof MglRecordType) {
      return "type";
    }

    return typeof rawValue;
  }
}

function isTrackableValue(value) {
  const rawValue = unwrapRuntimeValue(value);
  return value instanceof MglTrackedScalar
    || Array.isArray(rawValue)
    || rawValue instanceof MglInstance
    || rawValue instanceof MglRecordInstance
    || rawValue instanceof MglModule
    || rawValue instanceof MglFunction
    || rawValue instanceof NativeFunction
    || rawValue instanceof MglClass
    || rawValue instanceof MglRecordType;
}

function collectChildren(value) {
  const rawValue = unwrapRuntimeValue(value);
  const children = [];

  if (Array.isArray(rawValue)) {
    rawValue.forEach((item, index) => {
      children.push({
        key: `index:${index}`,
        reason: `element[${index}]`,
        value: item,
      });
    });
  } else if (rawValue instanceof MglInstance || rawValue instanceof MglRecordInstance) {
    rawValue.fields.forEach((fieldValue, fieldName) => {
      children.push({
        key: `field:${fieldName}`,
        reason: `field '${fieldName}'`,
        value: fieldValue,
      });
    });
  } else if (rawValue instanceof MglModule) {
    rawValue.exports.forEach((exportValue, exportName) => {
      children.push({
        key: `export:${exportName}`,
        reason: `module export '${exportName}'`,
        value: exportValue,
      });
    });
  } else if (rawValue instanceof MglFunction) {
    rawValue.closure.describeBindings({ includeStdlib: false }).forEach((binding) => {
      children.push({
        key: `capture:${binding.name}`,
        reason: `captured binding '${binding.name}'`,
        value: binding.value,
      });
    });
  }

  return children;
}

function estimateSize(value, seen = new Set()) {
  if (value instanceof MglTrackedScalar) {
    return estimateSize(value.value, seen);
  }

  const rawValue = unwrapRuntimeValue(value);

  if (rawValue === null || rawValue === undefined) {
    return 8;
  }

  if (typeof rawValue === "number") {
    return 8;
  }

  if (typeof rawValue === "boolean") {
    return 4;
  }

  if (typeof rawValue === "string") {
    return 24 + rawValue.length * 2;
  }

  if (seen.has(rawValue)) {
    return 0;
  }

  if (Array.isArray(rawValue)) {
    seen.add(rawValue);
    const total = 32 + rawValue.reduce((sum, item) => sum + estimateSize(item, seen), 0);
    seen.delete(rawValue);
    return total;
  }

  if (rawValue instanceof MglInstance || rawValue instanceof MglRecordInstance) {
    seen.add(rawValue);
    let total = 64;
    rawValue.fields.forEach((fieldValue, fieldName) => {
      total += fieldName.length * 2;
      total += estimateSize(fieldValue, seen);
    });
    seen.delete(rawValue);
    return total;
  }

  if (rawValue instanceof MglModule) {
    return 96 + rawValue.exports.size * 24;
  }

  if (rawValue instanceof MglFunction || rawValue instanceof NativeFunction) {
    return 96;
  }

  if (rawValue instanceof MglClass || rawValue instanceof MglRecordType) {
    return 80;
  }

  return 32;
}

function formatAllocation(entry) {
  return `${entry.typeName}#${entry.id}`;
}

module.exports = {
  MemoryRegistry,
  estimateSize,
  isTrackableValue,
};
