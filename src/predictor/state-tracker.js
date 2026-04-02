class PredictiveScope {
  constructor(parent = null) {
    this.parent = parent;
    this.bindings = new Map();
  }

  define(name, value, options = {}) {
    this.bindings.set(name, {
      value,
      declaredType: options.declaredType || null,
    });
    return value;
  }

  getBinding(name) {
    if (this.bindings.has(name)) {
      return this.bindings.get(name);
    }

    if (this.parent) {
      return this.parent.getBinding(name);
    }

    return null;
  }

  get(name) {
    const binding = this.getBinding(name);
    return binding ? binding.value : undefined;
  }

  assign(name, value) {
    if (this.bindings.has(name)) {
      const binding = this.bindings.get(name);
      binding.value = value;
      return value;
    }

    if (this.parent) {
      return this.parent.assign(name, value);
    }

    return undefined;
  }

  hasOwn(name) {
    return this.bindings.has(name);
  }

  clone(parent = this.parent ? this.parent.clone() : null) {
    const scope = new PredictiveScope(parent);
    this.bindings.forEach((binding, name) => {
      scope.bindings.set(name, {
        declaredType: binding.declaredType,
        value: cloneValue(binding.value),
      });
    });
    return scope;
  }
}

class PredictiveState {
  constructor(options = {}) {
    this.scope = options.scope || new PredictiveScope();
    this.outputs = [...(options.outputs || [])];
    this.warnings = [...(options.warnings || [])];
    this.errors = [...(options.errors || [])];
    this.metrics = {
      operations: options.metrics?.operations || 0,
      allocations: options.metrics?.allocations || 0,
      trackedAllocations: options.metrics?.trackedAllocations || 0,
      loops: options.metrics?.loops || 0,
      asyncOps: options.metrics?.asyncOps || 0,
      branches: options.metrics?.branches || 0,
      unsupported: options.metrics?.unsupported || 0,
      truncatedLoops: options.metrics?.truncatedLoops || 0,
      frames: options.metrics?.frames || 0,
      perFrameOperations: options.metrics?.perFrameOperations || 0,
      perFrameAllocations: options.metrics?.perFrameAllocations || 0,
      possibleLeaks: options.metrics?.possibleLeaks || 0,
    };
    this.confidencePenalty = options.confidencePenalty || 0;
    this.terminated = options.terminated || false;
    this.returned = options.returned || false;
    this.returnValue = cloneValue(options.returnValue);
    this.tasks = new Map(
      Array.from(options.tasks || []).map(([name, value]) => [name, cloneValue(value)]),
    );
    this.servers = (options.servers || []).map((server) => cloneValue(server));
    this.currentFile = options.currentFile || null;
    this.currentExports = new Set(options.currentExports || []);
    this.assumptions = [...(options.assumptions || [])];
    this.gameObjects = (options.gameObjects || []).map((value) => cloneValue(value));
  }

  clone() {
    return new PredictiveState({
      scope: this.scope.clone(),
      outputs: this.outputs,
      warnings: this.warnings,
      errors: this.errors,
      metrics: this.metrics,
      confidencePenalty: this.confidencePenalty,
      terminated: this.terminated,
      returned: this.returned,
      returnValue: this.returnValue,
      tasks: this.tasks,
      servers: this.servers,
      currentFile: this.currentFile,
      currentExports: this.currentExports,
      assumptions: this.assumptions,
      gameObjects: this.gameObjects,
    });
  }

  addOutput(value) {
    this.outputs.push(String(value));
  }

  warn(message, details = {}) {
    this.warnings.push({ message, ...details });
  }

  fail(message, details = {}) {
    this.errors.push({ message, ...details });
    this.terminated = true;
  }

  noteOperation(count = 1) {
    this.metrics.operations += count;
  }

  noteBranch() {
    this.metrics.branches += 1;
  }

  noteAsync() {
    this.metrics.asyncOps += 1;
  }

  noteAllocation(options = {}) {
    this.metrics.allocations += options.count || 1;
    if (options.tracked) {
      this.metrics.trackedAllocations += options.count || 1;
    }
    if (options.frameScoped) {
      this.metrics.perFrameAllocations += options.count || 1;
    }
  }

  noteFrameOperation(count = 1) {
    this.metrics.perFrameOperations += count;
  }
}

function makeUnknown(type = "any", label = "unknown", options = []) {
  return {
    __kind: "unknown",
    type,
    label,
    options: [...options],
  };
}

function makeNative(name, fn, options = {}) {
  return {
    __kind: "native",
    name,
    minArity: options.minArity ?? options.arity ?? 0,
    maxArity: options.maxArity ?? options.arity ?? Number.POSITIVE_INFINITY,
    call: fn,
  };
}

function makeArray(items = [], options = {}) {
  return {
    __kind: "array",
    items,
    elementType: options.elementType || null,
    tracked: options.tracked || false,
  };
}

function makeObject(fields = {}, options = {}) {
  return {
    __kind: options.kind || "object",
    typeName: options.typeName || "object",
    fields,
    tracked: options.tracked || false,
  };
}

function makeVector3(x, y, z) {
  return {
    __kind: "vector3",
    x,
    y,
    z,
  };
}

function makeFuture(value) {
  return {
    __kind: "future",
    value,
  };
}

function makeTrackedScalar(value) {
  return {
    __kind: "tracked-scalar",
    value,
    tracked: true,
  };
}

function isUnknown(value) {
  return Boolean(value && value.__kind === "unknown");
}

function isArrayValue(value) {
  return Boolean(value && value.__kind === "array");
}

function isObjectValue(value) {
  return Boolean(
    value
      && (value.__kind === "object" || value.__kind === "instance" || value.__kind === "module" || value.__kind === "vector3"),
  );
}

function isTrackedValue(value) {
  return Boolean(value && value.tracked);
}

function unwrapValue(value) {
  return value && value.__kind === "tracked-scalar" ? value.value : value;
}

function cloneValue(value) {
  const rawValue = unwrapValue(value);

  if (rawValue === null || rawValue === undefined) {
    return rawValue;
  }

  if (typeof rawValue === "string" || typeof rawValue === "number" || typeof rawValue === "boolean") {
    return rawValue;
  }

  if (Array.isArray(rawValue)) {
    return rawValue.map((item) => cloneValue(item));
  }

  if (!rawValue.__kind) {
    return { ...rawValue };
  }

  switch (rawValue.__kind) {
    case "unknown":
      return { ...rawValue, options: [...rawValue.options] };
    case "future":
      return makeFuture(cloneValue(rawValue.value));
    case "tracked-scalar":
      return makeTrackedScalar(cloneValue(rawValue.value));
    case "array":
      return makeArray(rawValue.items.map((item) => cloneValue(item)), {
        elementType: rawValue.elementType,
        tracked: rawValue.tracked,
      });
    case "vector3":
      return makeVector3(cloneValue(rawValue.x), cloneValue(rawValue.y), cloneValue(rawValue.z));
    case "object":
    case "instance":
    case "server":
      return {
        ...rawValue,
        fields: cloneFields(rawValue.fields),
        routes: rawValue.routes ? rawValue.routes.map((route) => ({ ...route })) : rawValue.routes,
      };
    case "module":
      return {
        ...rawValue,
        exports: new Map(Array.from(rawValue.exports.entries(), ([name, exportValue]) => [name, cloneValue(exportValue)])),
      };
    case "task":
      return {
        ...rawValue,
        executed: rawValue.executed || false,
        result: cloneValue(rawValue.result),
      };
    default:
      return { ...rawValue };
  }
}

function cloneFields(fields = {}) {
  return Object.fromEntries(
    Object.entries(fields).map(([name, value]) => [name, cloneValue(value)]),
  );
}

function stringifyPredictiveValue(value, seen = new Set()) {
  const rawValue = unwrapValue(value);

  if (rawValue === null) {
    return "null";
  }

  if (rawValue === undefined) {
    return "undefined";
  }

  if (typeof rawValue === "number" || typeof rawValue === "boolean") {
    return String(rawValue);
  }

  if (typeof rawValue === "string") {
    return rawValue;
  }

  if (isUnknown(rawValue)) {
    return rawValue.options.length > 0
      ? `${rawValue.label}(${rawValue.options.map((option) => stringifyPredictiveValue(option)).join(" | ")})`
      : rawValue.label;
  }

  if (isArrayValue(rawValue)) {
    return `[${rawValue.items.map((item) => stringifyPredictiveValue(item, seen)).join(", ")}]`;
  }

  if (rawValue.__kind === "vector3") {
    return `Vector3(${stringifyPredictiveValue(rawValue.x)}, ${stringifyPredictiveValue(rawValue.y)}, ${stringifyPredictiveValue(rawValue.z)})`;
  }

  if (rawValue.__kind === "future") {
    return stringifyPredictiveValue(rawValue.value, seen);
  }

  if (isObjectValue(rawValue)) {
    if (seen.has(rawValue)) {
      return "{<cycle>}";
    }

    seen.add(rawValue);
    const fields = rawValue.fields
      ? Object.entries(rawValue.fields).map(([name, fieldValue]) => `${name}: ${stringifyPredictiveValue(fieldValue, seen)}`).join(", ")
      : "";
    seen.delete(rawValue);
    return rawValue.__kind === "instance"
      ? `${rawValue.className} { ${fields} }`
      : `{ ${fields} }`;
  }

  return String(rawValue);
}

function inferValueType(value) {
  const rawValue = unwrapValue(value);

  if (rawValue === null) {
    return "null";
  }

  if (isUnknown(rawValue)) {
    return rawValue.type;
  }

  if (typeof rawValue === "number") {
    return "number";
  }

  if (typeof rawValue === "string") {
    return "string";
  }

  if (typeof rawValue === "boolean") {
    return "bool";
  }

  if (isArrayValue(rawValue)) {
    return "array";
  }

  if (rawValue.__kind === "vector3") {
    return "Vector3";
  }

  if (rawValue.__kind === "module") {
    return "module";
  }

  if (rawValue.__kind === "class") {
    return "class";
  }

  if (rawValue.__kind === "instance") {
    return rawValue.className;
  }

  return rawValue.typeName || "object";
}

function isTruthy(value) {
  const rawValue = unwrapValue(value);

  if (isUnknown(rawValue)) {
    if (rawValue.options.some((option) => Boolean(unwrapValue(option))) && rawValue.options.some((option) => !unwrapValue(option))) {
      return "unknown";
    }

    if (rawValue.options.length > 0) {
      return rawValue.options.every((option) => Boolean(unwrapValue(option))) ? true : false;
    }

    return "unknown";
  }

  return Boolean(rawValue);
}

module.exports = {
  PredictiveScope,
  PredictiveState,
  cloneValue,
  inferValueType,
  isArrayValue,
  isObjectValue,
  isTrackedValue,
  isTruthy,
  isUnknown,
  makeArray,
  makeFuture,
  makeNative,
  makeObject,
  makeTrackedScalar,
  makeUnknown,
  makeVector3,
  stringifyPredictiveValue,
  unwrapValue,
};
