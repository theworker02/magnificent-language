const { NativeFunction, stringifyValue, unwrapRuntimeValue } = require("../values");
const { arrayType, describeRuntimeType, namedType, tagValueWithType } = require("../types");
const { MglRuntimeError } = require("../../utils/errors");

function registerCoreLibrary(environment) {
  defineBuiltin(
    environment,
    "clock",
    new NativeFunction("clock", () => Date.now() / 1000, { arity: 0 }),
  );

  defineBuiltin(
    environment,
    "random",
    new NativeFunction("random", () => Math.random(), { arity: 0 }),
  );

  defineBuiltin(
    environment,
    "length",
    new NativeFunction(
      "length",
      (_interpreter, args) => {
        const value = args[0];
        const rawValue = unwrapRuntimeValue(value);
        if (typeof rawValue === "string" || Array.isArray(rawValue)) {
          return rawValue.length;
        }

        throw new MglRuntimeError("length() expects a string or array.");
      },
      { arity: 1 },
    ),
  );

  defineBuiltin(
    environment,
    "len",
    new NativeFunction(
      "len",
      (interpreter, args) => environment.get("length").call(interpreter, args),
      { arity: 1 },
    ),
  );

  defineBuiltin(
    environment,
    "push",
    new NativeFunction(
      "push",
      (interpreter, args) => {
        const target = args[0];
        const rawTarget = unwrapRuntimeValue(target);
        if (!Array.isArray(rawTarget)) {
          throw new MglRuntimeError("push() expects an array as its first argument.");
        }

        const typedElement = enforceTypedArrayElement(interpreter, rawTarget, args[1], "push()");
        rawTarget.push(typedElement);
        interpreter.memoryRegistry.markMutation(rawTarget, "push()");
        return rawTarget.length;
      },
      { arity: 2 },
    ),
  );

  defineBuiltin(
    environment,
    "range",
    new NativeFunction(
      "range",
      (_interpreter, args) => {
        const [start, end, rawStep] = args;

        if (![start, end].every((value) => typeof value === "number" && !Number.isNaN(value))) {
          throw new MglRuntimeError("range() expects numeric start and end values.");
        }

        const step = rawStep === undefined
          ? start <= end ? 1 : -1
          : rawStep;

        if (typeof step !== "number" || Number.isNaN(step)) {
          throw new MglRuntimeError("range() expects a numeric step.");
        }

        if (step === 0) {
          throw new MglRuntimeError("range() step cannot be zero.");
        }

        const values = [];
        const predicate = step > 0
          ? (value) => value <= end
          : (value) => value >= end;

        for (let current = start; predicate(current); current += step) {
          values.push(current);
        }

        return tagValueWithType(values, arrayType(namedType("number")));
      },
      { minArity: 2, maxArity: 3 },
    ),
  );

  defineBuiltin(
    environment,
    "join",
    new NativeFunction(
      "join",
      (_interpreter, args) => {
        const [value, separator] = args;
        const rawValue = unwrapRuntimeValue(value);
        if (!Array.isArray(rawValue)) {
          throw new MglRuntimeError("join() expects an array as its first argument.");
        }

        if (typeof separator !== "string") {
          throw new MglRuntimeError("join() expects a string separator.");
        }

        return rawValue.map((item) => stringifyValue(item)).join(separator);
      },
      { arity: 2 },
    ),
  );

  defineBuiltin(
    environment,
    "contains",
    new NativeFunction(
      "contains",
      (_interpreter, args) => {
        const [collection, value] = args;
        const rawCollection = unwrapRuntimeValue(collection);

        if (typeof rawCollection === "string") {
          return rawCollection.includes(String(unwrapRuntimeValue(value)));
        }

        if (Array.isArray(rawCollection)) {
          return rawCollection.some((item) => Object.is(unwrapRuntimeValue(item), unwrapRuntimeValue(value)));
        }

        throw new MglRuntimeError("contains() expects a string or array.");
      },
      { arity: 2 },
    ),
  );

  defineBuiltin(
    environment,
    "assert",
    new NativeFunction(
      "assert",
      (_interpreter, args) => {
        const [condition, message] = args;
        if (!condition) {
          throw new MglRuntimeError(message ? stringifyValue(message) : "Assertion failed.");
        }

        return null;
      },
      { minArity: 1, maxArity: 2 },
    ),
  );

  defineBuiltin(
    environment,
    "type",
    new NativeFunction("type", (_interpreter, args) => describeRuntimeType(args[0]), { arity: 1 }),
  );

  defineBuiltin(
    environment,
    "str",
    new NativeFunction("str", (_interpreter, args) => stringifyValue(args[0]), { arity: 1 }),
  );

  defineBuiltin(
    environment,
    "num",
    new NativeFunction(
      "num",
      (_interpreter, args) => {
        const value = Number(args[0]);
        if (Number.isNaN(value)) {
          throw new MglRuntimeError(`Cannot convert '${stringifyValue(args[0])}' to a number.`);
        }

        return value;
      },
      { arity: 1 },
    ),
  );
}

function defineBuiltin(environment, name, value) {
  environment.define(name, value, {
    source: "stdlib",
  });
}

function enforceTypedArrayElement(interpreter, arrayValue, elementValue, builtinName) {
  const taggedType = arrayValue && arrayValue[Symbol.for("mgl.runtime.type")];
  if (!taggedType || taggedType.type !== "ArrayType") {
    return elementValue;
  }

  return interpreter.enforceType(
    elementValue,
    taggedType.elementType,
    null,
    `${builtinName} expected ${interpreter.describeType(taggedType.elementType)} elements.`,
  );
}

module.exports = {
  registerCoreLibrary,
};
