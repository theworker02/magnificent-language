const { NativeFunction, stringifyValue, typeOfValue } = require("../values");
const { MglRuntimeError } = require("../../utils/errors");

function registerCoreLibrary(environment) {
  environment.define(
    "clock",
    new NativeFunction("clock", () => Date.now() / 1000, { arity: 0 }),
  );

  environment.define(
    "random",
    new NativeFunction("random", () => Math.random(), { arity: 0 }),
  );

  environment.define(
    "length",
    new NativeFunction(
      "length",
      (_interpreter, args) => {
        const value = args[0];
        if (typeof value === "string" || Array.isArray(value)) {
          return value.length;
        }

        throw new MglRuntimeError("length() expects a string or array.");
      },
      { arity: 1 },
    ),
  );

  environment.define(
    "len",
    new NativeFunction(
      "len",
      (interpreter, args) => environment.get("length").call(interpreter, args),
      { arity: 1 },
    ),
  );

  environment.define(
    "push",
    new NativeFunction(
      "push",
      (_interpreter, args) => {
        const target = args[0];
        if (!Array.isArray(target)) {
          throw new MglRuntimeError("push() expects an array as its first argument.");
        }

        target.push(args[1]);
        return target.length;
      },
      { arity: 2 },
    ),
  );

  environment.define(
    "type",
    new NativeFunction("type", (_interpreter, args) => typeOfValue(args[0]), { arity: 1 }),
  );

  environment.define(
    "str",
    new NativeFunction("str", (_interpreter, args) => stringifyValue(args[0]), { arity: 1 }),
  );

  environment.define(
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

module.exports = {
  registerCoreLibrary,
};
