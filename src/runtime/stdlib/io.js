const fs = require("fs");
const path = require("path");

const { NativeFunction, stringifyValue, unwrapRuntimeValue } = require("../values");
const { arrayType, namedType, tagValueWithType } = require("../types");
const { MglRuntimeError } = require("../../utils/errors");

function registerIoLibrary(environment, options = {}) {
  const stdout = options.stdout || process.stdout;

  defineBuiltin(
    environment,
    "print",
    new NativeFunction(
      "print",
      (_interpreter, args) => {
        stdout.write(`${args.map((value) => stringifyValue(value)).join(" ")}\n`);
        return null;
      },
      { minArity: 0 },
    ),
  );

  defineBuiltin(
    environment,
    "input",
    new NativeFunction(
      "input",
      (_interpreter, args) => {
        const prompt = args.length === 1 ? stringifyValue(args[0]) : "";
        if (prompt) {
          stdout.write(prompt);
        }

        return readLineSync();
      },
      { minArity: 0, maxArity: 1 },
    ),
  );

  defineBuiltin(
    environment,
    "readFile",
    new NativeFunction(
      "readFile",
      (interpreter, args) => {
        const filePath = resolveRuntimePath(interpreter, args[0]);

        try {
          return fs.readFileSync(filePath, "utf8");
        } catch (error) {
          throw new MglRuntimeError(`readFile() failed: ${error.message}`);
        }
      },
      { arity: 1 },
    ),
  );

  defineBuiltin(
    environment,
    "readLines",
    new NativeFunction(
      "readLines",
      (interpreter, args) => {
        const filePath = resolveRuntimePath(interpreter, args[0]);

        try {
          const lines = fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n").split("\n");
          return tagValueWithType(lines, arrayType(namedType("string")));
        } catch (error) {
          throw new MglRuntimeError(`readLines() failed: ${error.message}`);
        }
      },
      { arity: 1 },
    ),
  );

  defineBuiltin(
    environment,
    "writeFile",
    new NativeFunction(
      "writeFile",
      (interpreter, args) => {
        const filePath = resolveRuntimePath(interpreter, args[0]);
        const data = stringifyValue(args[1]);

        try {
          fs.mkdirSync(path.dirname(filePath), { recursive: true });
          fs.writeFileSync(filePath, data, "utf8");
          return null;
        } catch (error) {
          throw new MglRuntimeError(`writeFile() failed: ${error.message}`);
        }
      },
      { arity: 2 },
    ),
  );

  defineBuiltin(
    environment,
    "exists",
    new NativeFunction(
      "exists",
      (interpreter, args) => {
        const filePath = resolveRuntimePath(interpreter, args[0]);
        return fs.existsSync(filePath);
      },
      { arity: 1 },
    ),
  );

  defineBuiltin(
    environment,
    "cwd",
    new NativeFunction(
      "cwd",
      (interpreter) => interpreter.cwd || process.cwd(),
      { arity: 0 },
    ),
  );
}

function defineBuiltin(environment, name, value) {
  environment.define(name, value, {
    source: "stdlib",
  });
}

function resolveRuntimePath(interpreter, rawPath) {
  const resolvedPath = unwrapRuntimeValue(rawPath);

  if (typeof resolvedPath !== "string") {
    throw new MglRuntimeError("File path arguments must be strings.");
  }

  if (path.isAbsolute(resolvedPath)) {
    return resolvedPath;
  }

  return path.resolve(interpreter.cwd || process.cwd(), resolvedPath);
}

function readLineSync() {
  const buffer = Buffer.alloc(1);
  let result = "";

  while (true) {
    const bytesRead = fs.readSync(0, buffer, 0, 1, null);

    if (bytesRead === 0) {
      break;
    }

    const char = buffer.toString("utf8", 0, bytesRead);
    if (char === "\n") {
      break;
    }

    if (char !== "\r") {
      result += char;
    }
  }

  return result;
}

module.exports = {
  registerIoLibrary,
};
