const fs = require("fs");
const path = require("path");

const { NativeFunction, stringifyValue } = require("../values");
const { MglRuntimeError } = require("../../utils/errors");

function registerIoLibrary(environment, options = {}) {
  const stdout = options.stdout || process.stdout;

  environment.define(
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

  environment.define(
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

  environment.define(
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

  environment.define(
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
}

function resolveRuntimePath(interpreter, rawPath) {
  if (typeof rawPath !== "string") {
    throw new MglRuntimeError("File path arguments must be strings.");
  }

  if (path.isAbsolute(rawPath)) {
    return rawPath;
  }

  return path.resolve(interpreter.cwd || process.cwd(), rawPath);
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
