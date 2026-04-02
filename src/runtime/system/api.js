const fs = require("fs");
const os = require("os");
const path = require("path");
const { exec: execCallback, spawn } = require("child_process");

const { MglFuture } = require("../async");
const { NativeFunction, runtimeValueFromJs, unwrapRuntimeValue } = require("../values");
const { MglRuntimeError } = require("../../utils/errors");

function createSystemApi(interpreter) {
  const sandbox = interpreter.config?.sandbox || {};

  return {
    os() {
      return normalizePlatform(process.platform);
    },
    arch() {
      return process.arch;
    },
    cwd() {
      return interpreter.cwd || process.cwd();
    },
    home() {
      return os.homedir();
    },
    pid() {
      return process.pid;
    },
    env(name = null) {
      if (name === null || name === undefined) {
        return runtimeValueFromJs(process.env, { anonymous: true });
      }

      return process.env[String(unwrapRuntimeValue(name))] || null;
    },
    readDir(targetPath) {
      const resolvedPath = resolvePath(interpreter, targetPath);
      return runtimeValueFromJs(fs.readdirSync(resolvedPath), { anonymous: true });
    },
    watch(targetPath) {
      const resolvedPath = resolvePath(interpreter, targetPath);
      let lastEvent = null;
      let lastFile = null;
      const watcher = fs.watch(resolvedPath, (eventType, fileName) => {
        lastEvent = eventType;
        lastFile = fileName || null;
      });

      return runtimeValueFromJs({
        path: resolvedPath,
        close: new NativeFunction("system.watch.close", () => {
          watcher.close();
          return true;
        }, { arity: 0 }),
        event: new NativeFunction("system.watch.event", () => runtimeValueFromJs({
          type: lastEvent,
          file: lastFile,
        }, { anonymous: true }), { arity: 0 }),
      }, { anonymous: true });
    },
    exec(command, options = {}) {
      ensureExecAllowed(sandbox, "exec");
      return new MglFuture(
        runCommand(
          String(unwrapRuntimeValue(command)),
          normalizeExecOptions(options, interpreter),
        ).then((result) => runtimeValueFromJs(result, { anonymous: true })),
        { label: `exec:${command}` },
      );
    },
    spawn(command, args = [], options = {}) {
      ensureExecAllowed(sandbox, "spawn");
      return createProcessHandle(
        interpreter,
        String(unwrapRuntimeValue(command)),
        normalizeSpawnArgs(args),
        normalizeExecOptions(options, interpreter),
      );
    },
  };
}

function createProcessHandle(interpreter, command, args, options) {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    shell: Boolean(options.shell),
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  let status = "running";
  let exitCode = null;
  let signal = null;

  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString("utf8");
  });

  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });

  const completion = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code, closeSignal) => {
      exitCode = typeof code === "number" ? code : null;
      signal = closeSignal || null;
      status = closeSignal ? "signaled" : code === 0 ? "completed" : "failed";
      resolve(runtimeValueFromJs({
        command,
        args,
        code: exitCode,
        signal,
        ok: exitCode === 0 && !signal,
        stdout,
        stderr,
        status,
      }, { anonymous: true }));
    });
  });

  return runtimeValueFromJs({
    command,
    pid: child.pid || null,
    status: new NativeFunction("system.process.status", () => status, { arity: 0 }),
    wait: new NativeFunction("system.process.wait", () => new MglFuture(completion, {
      label: `process:${command}`,
    }), { arity: 0 }),
    kill: new NativeFunction("system.process.kill", (_interpreter, killArgs) => {
      const requestedSignal = killArgs[0] ? String(unwrapRuntimeValue(killArgs[0])) : "SIGTERM";
      return child.kill(requestedSignal);
    }, { minArity: 0, maxArity: 1 }),
    stdout: new NativeFunction("system.process.stdout", () => stdout, { arity: 0 }),
    stderr: new NativeFunction("system.process.stderr", () => stderr, { arity: 0 }),
  }, { anonymous: true });
}

function ensureExecAllowed(sandbox, kind) {
  if (sandbox.enabled && sandbox.allowExec === false) {
    throw new MglRuntimeError(`Sandbox mode blocks ${kind}().`);
  }
}

function normalizePlatform(platform) {
  if (platform === "win32") {
    return "windows";
  }

  if (platform === "darwin") {
    return "mac";
  }

  return platform === "linux" ? "linux" : platform;
}

function normalizeSpawnArgs(args) {
  if (Array.isArray(args)) {
    return args.map((value) => String(unwrapRuntimeValue(value)));
  }

  if (args && args.fields instanceof Map && args.fields.has("items")) {
    const items = unwrapRuntimeValue(args.fields.get("items"));
    if (Array.isArray(items)) {
      return items.map((value) => String(unwrapRuntimeValue(value)));
    }
  }

  return [];
}

function normalizeExecOptions(options, interpreter) {
  if (!options || typeof options !== "object") {
    return {
      cwd: interpreter.cwd || process.cwd(),
      env: process.env,
      shell: false,
    };
  }

  const normalized = options.fields instanceof Map
    ? Object.fromEntries(Array.from(options.fields.entries()))
    : options;

  return {
    cwd: normalized.cwd ? resolvePath(interpreter, normalized.cwd) : interpreter.cwd || process.cwd(),
    env: normalized.env && normalized.env.fields instanceof Map
      ? Object.fromEntries(Array.from(normalized.env.fields.entries()).map(([key, value]) => [key, String(unwrapRuntimeValue(value))]))
      : process.env,
    shell: Boolean(unwrapRuntimeValue(normalized.shell || false)),
  };
}

function resolvePath(interpreter, rawPath) {
  const value = unwrapRuntimeValue(rawPath);

  if (typeof value !== "string") {
    throw new MglRuntimeError("File system paths must be strings.");
  }

  if (path.isAbsolute(value)) {
    return value;
  }

  return path.resolve(interpreter.cwd || process.cwd(), value);
}

function runCommand(command, options) {
  return new Promise((resolve, reject) => {
    execCallback(command, {
      cwd: options.cwd,
      env: options.env,
      shell: options.shell === true ? true : undefined,
      windowsHide: true,
    }, (error, stdout, stderr) => {
      if (error && typeof error.code !== "number") {
        reject(error);
        return;
      }

      resolve({
        stdout,
        stderr,
        code: error && typeof error.code === "number" ? error.code : 0,
        signal: error ? error.signal || null : null,
        ok: !error,
      });
    });
  });
}

module.exports = {
  createSystemApi,
  normalizePlatform,
  resolvePath,
};
