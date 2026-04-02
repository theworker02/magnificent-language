const {
  runtimeValueFromJs,
  NativeFunction,
  stringifyValue,
} = require("../values");
const {
  buildOptimizationHints,
  captureSnapshot,
  compareSnapshots,
  explainAllocation,
  inspectValue,
  summarizeOwners,
  summarizeReferences,
} = require("../memory");

function registerMemoryLibrary(environment) {
  defineBuiltin(
    environment,
    "track",
    new NativeFunction(
      "track",
      (interpreter, args) => interpreter.memoryRegistry.trackExplicitValue(args[0], {
        filePath: interpreter.filePath,
        scopeName: interpreter.environment.scopeName,
        reason: "tracked via built-in track()",
      }),
      { arity: 1 },
    ),
  );

  defineBuiltin(
    environment,
    "memoryOf",
    new NativeFunction(
      "memoryOf",
      (interpreter, args) => runtimeValueFromJs(inspectValue(interpreter.memoryRegistry, args[0]), { anonymous: true }),
      { arity: 1 },
    ),
  );

  defineBuiltin(
    environment,
    "ownerOf",
    new NativeFunction(
      "ownerOf",
      (interpreter, args) => summarizeOwners(interpreter.memoryRegistry, args[0]),
      { arity: 1 },
    ),
  );

  defineBuiltin(
    environment,
    "refsOf",
    new NativeFunction(
      "refsOf",
      (interpreter, args) => runtimeValueFromJs(
        summarizeReferences(interpreter.memoryRegistry, args[0]),
        { anonymous: true },
      ),
      { arity: 1 },
    ),
  );

  defineBuiltin(
    environment,
    "sizeOf",
    new NativeFunction(
      "sizeOf",
      (interpreter, args) => {
        const details = inspectValue(interpreter.memoryRegistry, args[0]);
        return details.tracked ? details.sizeEstimate : 0;
      },
      { arity: 1 },
    ),
  );

  defineBuiltin(
    environment,
    "isTracked",
    new NativeFunction(
      "isTracked",
      (interpreter, args) => Boolean(interpreter.memoryRegistry.getAllocation(args[0])),
      { arity: 1 },
    ),
  );

  defineBuiltin(
    environment,
    "whyAlive",
    new NativeFunction(
      "whyAlive",
      (interpreter, args) => explainAllocation(interpreter.memoryRegistry, args[0]),
      { arity: 1 },
    ),
  );

  defineBuiltin(
    environment,
    "traceAllocations",
    new NativeFunction(
      "traceAllocations",
      (interpreter) => runtimeValueFromJs(interpreter.memoryRegistry.traceAllocations(), { anonymous: true }),
      { arity: 0 },
    ),
  );

  defineBuiltin(
    environment,
    "optimize",
    new NativeFunction(
      "optimize",
      (interpreter, args) => buildOptimizationHints(interpreter.memoryRegistry, args[0]),
      { arity: 1 },
    ),
  );

  defineBuiltin(
    environment,
    "snapshotMemory",
    new NativeFunction(
      "snapshotMemory",
      (interpreter, args) => runtimeValueFromJs(
        captureSnapshot(interpreter.memoryRegistry, args[0] ? stringifyValue(args[0]) : null),
        { anonymous: true },
      ),
      { minArity: 0, maxArity: 1 },
    ),
  );

  defineBuiltin(
    environment,
    "compareMemory",
    new NativeFunction(
      "compareMemory",
      (_interpreter, args) => runtimeValueFromJs(compareSnapshots(jsSnapshot(args[0]), jsSnapshot(args[1])), { anonymous: true }),
      { arity: 2 },
    ),
  );

  defineBuiltin(
    environment,
    "watchMemory",
    new NativeFunction(
      "watchMemory",
      (interpreter, args) => {
        const label = args[1] ? stringifyValue(args[1]) : null;
        const entry = interpreter.memoryRegistry.watchValue(args[0], label);
        return runtimeValueFromJs(
          entry
            ? { tracked: true, id: entry.id, label: entry.watchLabel }
            : { tracked: false, message: "Value is not trackable." },
          { anonymous: true },
        );
      },
      { minArity: 1, maxArity: 2 },
    ),
  );
}

function defineBuiltin(environment, name, value) {
  environment.define(name, value, {
    source: "stdlib",
  });
}

function jsSnapshot(value) {
  if (value && typeof value === "object" && value.fields instanceof Map) {
    const snapshot = {};
    value.fields.forEach((fieldValue, fieldName) => {
      snapshot[fieldName] = jsSnapshot(fieldValue);
    });
    return snapshot;
  }

  if (Array.isArray(value)) {
    return value.map((item) => jsSnapshot(item));
  }

  return value;
}

module.exports = {
  registerMemoryLibrary,
};
