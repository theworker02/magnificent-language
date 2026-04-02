const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const { decodeRustResult, encodeRustArgument } = require("../ffi");
const { NativeFunction, MglModule, runtimeValueFromJs } = require("../values");
const { compileRustModule } = require("./project");
const { MglRuntimeError } = require("../../utils/errors");

function loadRustModule(interpreter, modulePath, options = {}) {
  ensureRustAllowed(interpreter);
  const compiled = compileRustModule(modulePath, {
    projectRoot: options.projectRoot || findProjectRoot(modulePath),
  });
  const module = new MglModule(compiled.moduleName, modulePath);
  const exportsMap = new Map();

  compiled.functions.forEach((fn) => {
    exportsMap.set(
      fn.name,
      new NativeFunction(`rust.${compiled.moduleName}.${fn.name}`, (_interpreter, args) => {
        if (args.length !== fn.params.length) {
          throw new MglRuntimeError(`Rust export '${fn.name}' expected ${fn.params.length} argument(s), received ${args.length}.`, {
            filePath: modulePath,
          });
        }

        const encodedArgs = fn.params.map((param, index) => encodeRustArgument(args[index], param.type));
        const bridgeResult = spawnSync(compiled.bridgePath, [compiled.libraryPath, fn.name, ...encodedArgs], {
          encoding: "utf8",
        });

        if (bridgeResult.error && bridgeResult.status !== 0) {
          throw new MglRuntimeError(`Unable to invoke Rust export '${fn.name}': ${bridgeResult.error.message}`, {
            filePath: modulePath,
          });
        }

        if (bridgeResult.status !== 0) {
          throw new MglRuntimeError(
            `Rust bridge failed for '${fn.name}'.\n${(bridgeResult.stderr || bridgeResult.stdout || "").trim()}`,
            { filePath: modulePath },
          );
        }

        return runtimeValueFromJs(decodeRustResult((bridgeResult.stdout || "").trim()), { anonymous: true });
      }, { arity: fn.params.length }),
    );
  });

  module.setExports(exportsMap);
  return {
    name: compiled.moduleName,
    module,
    compiled,
  };
}

function discoverRustImports(entryFile, inspector) {
  const project = inspector.inspectProject(entryFile);
  const rustImports = new Set();

  project.files.forEach((file) => {
    inspector.collectImports(file.program)
      .filter((statement) => (statement.importKind || "mgl") === "rust")
      .forEach((statement) => {
        rustImports.add(
          inspector.resolveImportPath(file.filePath, statement.source.literal, "rust"),
        );
      });
  });

  return Array.from(rustImports);
}

function ensureRustAllowed(interpreter) {
  const sandbox = interpreter.config?.sandbox || {};
  if (sandbox.enabled && sandbox.allowRust === false) {
    throw new MglRuntimeError("Sandbox mode blocks Rust FFI.");
  }
}

function findProjectRoot(filePath) {
  let current = path.dirname(path.resolve(filePath));

  while (true) {
    const configPath = path.join(current, "mgl.config.json");
    if (fs.existsSync(configPath)) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return path.dirname(path.resolve(filePath));
    }

    current = parent;
  }
}

module.exports = {
  compileRustModule,
  discoverRustImports,
  loadRustModule,
};
