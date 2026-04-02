const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const { loadMglConfig, resolveEntryFile } = require("./config");
const { analyzeProject } = require("./analyzer");
const { buildNativeBundle, renderNativeBuildReport } = require("./cli/build-native");
const { buildRustArtifacts, renderRustBuildReport } = require("./cli/build-rust");
const { renderArchitectureGraph, renderDependencyGraph } = require("./graphs");
const { createSession, runFile, version } = require("./index");
const {
  renderAnalyzeReport,
  renderExplainReport,
  renderHealthReport,
  renderImproveReport,
  renderPerformanceReport,
} = require("./insights");
const { predictProject, renderPredictionReport } = require("./predictor");
const { renderRefactorPlan } = require("./refactor");
const { resolveFuture } = require("./runtime/async");
const { renderLiveAllocations, renderLeakReport, renderMemoryGraph, renderMemorySummary } = require("./cli/memory");
const { findRustBinary } = require("./runtime/rust/toolchain");
const { startRepl } = require("./repl/repl");
const { checkFile, inspectFile, renderAst, renderTokens } = require("./tooling/inspector");
const { buildUnityProject, renderUnityBuildReport } = require("./unity");
const { formatError } = require("./utils/errors");

async function runCli(args, io = {}) {
  const stdin = io.stdin || process.stdin;
  const stdout = io.stdout || process.stdout;
  const stderr = io.stderr || process.stderr;
  const color = io.color ?? Boolean(stderr.isTTY);
  const [command, ...rest] = args;

  try {
    switch (command) {
      case undefined:
      case "help":
      case "--help":
      case "-h":
        stdout.write(`${buildHelpText()}\n`);
        return 0;
      case "version":
      case "--version":
      case "-v":
        stdout.write(`mgl ${version}\n`);
        return 0;
      case "run":
        return await handleRun(rest, { stdout, stderr });
      case "build":
        return await handleBuild(rest, { stdout, stderr, color });
      case "predict":
        return handlePredict(rest, { stdout });
      case "unity":
        return await handleUnity(rest, { stdout, stderr, color });
      case "analyze":
        return handleAnalyze(rest, { stdout });
      case "improve":
        return handleImprove(rest, { stdout });
      case "explain":
        return handleExplain(rest, { stdout });
      case "performance":
        return handlePerformance(rest, { stdout });
      case "refactor":
        return handleRefactor(rest, { stdout });
      case "health":
        return handleHealth(rest, { stdout });
      case "serve":
      case "server":
        return await handleServe(rest, { stdout, stderr, color });
      case "test":
        return await handleTest(rest, { stdout, stderr, color });
      case "check":
        return handleCheck(rest, { stdout, stderr });
      case "ast":
        return handleAst(rest, { stdout, stderr });
      case "tokens":
        return handleTokens(rest, { stdout, stderr });
      case "memory":
        return await handleMemory(rest, { stdout, stderr });
      case "doctor":
        return handleDoctor({ stdout });
      case "repl":
        return await startRepl({
          stdin,
          stdout,
          stderr,
          color,
          session: createSession({ stdout, stderr, cwd: process.cwd() }),
        });
      case "init":
        return handleInit(rest, { stdout, stderr });
      default:
        stderr.write(`Unknown command '${command}'.\n\n${buildHelpText()}\n`);
        return 1;
    }
  } catch (error) {
    stderr.write(`${formatError(error, { color })}\n`);
    return 1;
  }
}

async function handleRun(args, io) {
  const filePath = resolveCliEntry(args[0]);
  const loadedConfig = loadMglConfig({ startPath: filePath });
  const session = createSession({
    stdout: io.stdout,
    stderr: io.stderr,
    cwd: path.dirname(filePath),
    filePath,
    config: loadedConfig.config,
  });

  await runFile(filePath, {
    stdout: io.stdout,
    stderr: io.stderr,
    session,
    cwd: path.dirname(filePath),
    config: loadedConfig.config,
  });

  if (loadedConfig.config.snapshotOnExit) {
    io.stdout.write(`\n${renderMemorySummary(session.interpreter.memoryRegistry)}\n`);
  }

  return 0;
}

async function handleBuild(args, io) {
  const flags = new Set(args.filter((arg) => arg.startsWith("--")));
  const fileArg = args.find((arg) => !arg.startsWith("--"));
  const filePath = resolveCliEntry(fileArg);
  const loadedConfig = loadMglConfig({ startPath: filePath });
  const rustReport = buildRustArtifacts(filePath, {
    projectRoot: loadedConfig.rootDirectory,
  });

  if (rustReport.builds.length > 0) {
    io.stdout.write(`${renderRustBuildReport(rustReport)}\n`);
  }

  if (flags.has("--unity")) {
    const unityResult = buildUnityProject(filePath, {
      outputDir: path.resolve(loadedConfig.rootDirectory, loadedConfig.config.unity.outputDir, "Assets", "MGLGenerated"),
    });
    io.stdout.write(`${renderUnityBuildReport(unityResult)}\n`);
    return 0;
  }

  if (flags.has("--native")) {
    const nativeResult = buildNativeBundle(filePath, {
      outputDir: path.resolve(loadedConfig.rootDirectory, "build", "native", path.basename(filePath, path.extname(filePath))),
    });
    io.stdout.write(`${renderNativeBuildReport(nativeResult)}\n`);
    return 0;
  }

  if (rustReport.builds.length === 0) {
    io.stdout.write("No Rust imports detected. Build validation passed.\n");
  }

  return 0;
}

function handlePredict(args, io) {
  const flags = new Set(args.filter((arg) => arg.startsWith("--")));
  const fileArg = args.find((arg) => !arg.startsWith("--"));
  const filePath = resolveCliEntry(fileArg);
  const loadedConfig = loadMglConfig({ startPath: filePath });
  const prediction = predictProject(filePath, {
    maxPaths: loadedConfig.config.predict.maxPaths,
    maxLoopIterations: loadedConfig.config.predict.maxLoopIterations,
    framesToSimulate: loadedConfig.config.predict.framesToSimulate,
    gameMode: flags.has("--game"),
  });
  io.stdout.write(`${renderPredictionReport(prediction)}\n`);
  return 0;
}

async function handleUnity(args, io) {
  const flags = new Set(args.filter((arg) => arg.startsWith("--")));
  const fileArg = args.find((arg) => !arg.startsWith("--"));
  const filePath = resolveCliEntry(fileArg);
  const loadedConfig = loadMglConfig({ startPath: filePath });
  const outputDir = path.resolve(loadedConfig.rootDirectory, loadedConfig.config.unity.outputDir, "Assets", "MGLGenerated");

  if (flags.has("--watch")) {
    return watchUnityBuild(filePath, outputDir, {
      stdout: io.stdout,
      stderr: io.stderr,
      color: io.color,
      configPath: loadedConfig.configPath,
    });
  }

  const result = buildUnityProject(filePath, { outputDir });
  io.stdout.write(`${renderUnityBuildReport(result)}\n`);
  return 0;
}

async function handleServe(args, io) {
  const flags = new Set(args.filter((arg) => arg.startsWith("--")));
  const fileArg = args.find((arg) => !arg.startsWith("--"));
  const filePath = resolveCliEntry(fileArg);
  return serveProject(filePath, {
    stdout: io.stdout,
    stderr: io.stderr,
    color: io.color,
    watch: flags.has("--watch"),
  });
}

async function handleTest(args, io) {
  const apiMode = args[0] === "api";
  const fileArg = apiMode ? args[1] : args[0];
  const filePath = resolveCliEntry(fileArg);
  const loadedConfig = loadMglConfig({ startPath: filePath });
  const session = createSession({
    stdout: io.stdout,
    stderr: io.stderr,
    cwd: path.dirname(filePath),
    filePath,
    config: loadedConfig.config,
  });

  await runFile(filePath, {
    stdout: io.stdout,
    stderr: io.stderr,
    session,
    cwd: path.dirname(filePath),
    config: loadedConfig.config,
  });

  const results = await session.interpreter.runRegisteredTests({ apiMode });
  if (results.length === 0) {
    io.stdout.write("No tests registered.\n");
    return 0;
  }

  let failed = 0;

  results.forEach((result) => {
    if (result.status === "passed") {
      io.stdout.write(`PASS ${result.name}\n`);
      return;
    }

    failed += 1;
    io.stdout.write(`FAIL ${result.name}\n`);
    io.stderr.write(`${formatError(result.error, { color: io.color })}\n`);
  });

  io.stdout.write(`\n${results.length - failed} passed, ${failed} failed.\n`);
  return failed === 0 ? 0 : 1;
}

function handleCheck(args, io) {
  const filePath = resolveCliEntry(args[0]);
  const result = checkFile(filePath);
  io.stdout.write(`Check passed for ${result.files.length} file(s).\n`);
  result.files.forEach((resolvedPath) => {
    io.stdout.write(`  ${path.relative(process.cwd(), resolvedPath) || resolvedPath}\n`);
  });
  return 0;
}

function handleAnalyze(args, io) {
  const flags = new Set(args.filter((arg) => arg.startsWith("--")));
  const fileArg = args.find((arg) => !arg.startsWith("--"));
  const analysis = analyzeEntry(fileArg);
  io.stdout.write(`${renderAnalyzeReport(analysis)}\n`);

  if (flags.has("--graph")) {
    io.stdout.write(`\n${renderArchitectureGraph(analysis)}\n`);
    io.stdout.write(`\n${renderDependencyGraph(analysis)}\n`);
  }

  return 0;
}

function handleImprove(args, io) {
  const analysis = analyzeEntry(args[0]);
  io.stdout.write(`${renderImproveReport(analysis)}\n`);
  return 0;
}

function handleExplain(args, io) {
  const analysis = analyzeEntry(args[0]);
  io.stdout.write(`${renderExplainReport(analysis)}\n`);
  return 0;
}

function handlePerformance(args, io) {
  const analysis = analyzeEntry(args[0]);
  io.stdout.write(`${renderPerformanceReport(analysis)}\n`);
  return 0;
}

function handleRefactor(args, io) {
  const analysis = analyzeEntry(args[0]);
  io.stdout.write(`${renderRefactorPlan(analysis.refactors, analysis.rootDirectory)}\n`);
  return 0;
}

function handleHealth(args, io) {
  const analysis = analyzeEntry(args[0]);
  io.stdout.write(`${renderHealthReport(analysis)}\n`);
  return 0;
}

function handleAst(args, io) {
  const filePath = resolveCliEntry(args[0]);
  const result = inspectFile(filePath);
  io.stdout.write(`${renderAst(result.program)}\n`);
  return 0;
}

function handleTokens(args, io) {
  const filePath = resolveCliEntry(args[0]);
  const result = inspectFile(filePath);
  io.stdout.write(`${renderTokens(result.tokens)}\n`);
  return 0;
}

async function handleMemory(args, io) {
  const flags = new Set(args.filter((arg) => arg.startsWith("--")));
  const fileArg = args.find((arg) => !arg.startsWith("--"));
  const filePath = resolveCliEntry(fileArg);
  const loadedConfig = loadMglConfig({
    startPath: filePath,
    overrides: {
      trackAllocations: true,
      memoryMode: flags.has("--live") ? "balanced" : "debug-memory",
    },
  });
  const session = createSession({
    stdout: io.stdout,
    stderr: io.stderr,
    cwd: path.dirname(filePath),
    filePath,
    config: loadedConfig.config,
  });

  await runFile(filePath, {
    stdout: io.stdout,
    stderr: io.stderr,
    session,
    cwd: path.dirname(filePath),
    config: loadedConfig.config,
  });

  if (flags.has("--graph")) {
    io.stdout.write(`\n${renderMemoryGraph(session.interpreter.memoryRegistry)}\n`);
    return 0;
  }

  if (flags.has("--leaks")) {
    io.stdout.write(`\n${renderLeakReport(session.interpreter.memoryRegistry)}\n`);
    return 0;
  }

  if (flags.has("--live")) {
    io.stdout.write(`\n${renderLiveAllocations(session.interpreter.memoryRegistry)}\n`);
    return 0;
  }

  io.stdout.write(`\n${renderMemorySummary(session.interpreter.memoryRegistry)}\n`);
  return 0;
}

function handleDoctor(io) {
  io.stdout.write("MGL Doctor\n");
  io.stdout.write(`Node: ${process.version}\n`);
  io.stdout.write(`Platform: ${process.platform}\n`);
  io.stdout.write(`Working directory: ${process.cwd()}\n`);
  io.stdout.write(`Fetch: ${typeof fetch === "function" ? "available" : "missing"}\n`);
  io.stdout.write(`cargo: ${binaryVersion("cargo") || "missing"}\n`);
  io.stdout.write(`rustc: ${binaryVersion("rustc") || "missing"}\n`);
  io.stdout.write("CLI: healthy\n");
  return 0;
}

function handleInit(args, io) {
  if (args.length === 0) {
    io.stderr.write(`Missing project directory.\n\n${buildHelpText()}\n`);
    return 1;
  }

  const projectDirectory = path.resolve(args[0]);
  const mainFile = path.join(projectDirectory, "main.mgl");
  const configFile = path.join(projectDirectory, "mgl.config.json");
  const modulesDirectory = path.join(projectDirectory, "modules");
  const mathFile = path.join(modulesDirectory, "math.mgl");
  const memoryFile = path.join(modulesDirectory, "memory_demo.mgl");
  const platformFile = path.join(modulesDirectory, "platform_demo.mgl");

  fs.mkdirSync(projectDirectory, { recursive: true });

  if (
    fs.existsSync(mainFile)
    || fs.existsSync(configFile)
    || fs.existsSync(mathFile)
    || fs.existsSync(memoryFile)
    || fs.existsSync(platformFile)
  ) {
    io.stderr.write(`Refusing to overwrite existing MGL project files in ${projectDirectory}.\n`);
    return 1;
  }

  fs.mkdirSync(modulesDirectory, { recursive: true });

  fs.writeFileSync(
    mainFile,
    [
      "import \"./modules/platform_demo.mgl\" as demo",
      "",
      "await demo.main()",
      "",
    ].join("\n"),
    "utf8",
  );

  fs.writeFileSync(
    mathFile,
    [
      "export func sum(values: array<number>): number {",
      "  let total: number = 0",
      "",
      "  loop i from 0 to length(values) - 1 {",
      "    total = total + values[i]",
      "  }",
      "",
      "  return total",
      "}",
      "",
      "export func average(values: array<number>): number {",
      "  return sum(values) / length(values)",
      "}",
      "",
    ].join("\n"),
    "utf8",
  );

  fs.writeFileSync(
    memoryFile,
    [
      "type Inventory {",
      "  items: array<string>",
      "}",
      "",
      "export func demoMemory(): void {",
      "  let inv = track Inventory { items: [\"rope\", \"torch\"] }",
      "  print(memoryOf(inv))",
      "}",
      "",
    ].join("\n"),
    "utf8",
  );

  fs.writeFileSync(
    platformFile,
    [
      "import \"./math.mgl\" as math",
      "import \"./memory_demo.mgl\" as memory",
      "",
      "export func main() async {",
      "  log.info(\"Starter app booting\")",
      "  await sleep(10)",
      "  memory.demoMemory()",
      "  print(\"sum=\" + math.sum([1, 2, 3]))",
      "}",
      "",
    ].join("\n"),
    "utf8",
  );

  fs.writeFileSync(
    configFile,
    `${JSON.stringify({
      name: path.basename(projectDirectory),
      version: "1.6.0",
      entry: "main.mgl",
      mode: "script",
      port: 3000,
      watch: false,
      memoryMode: "debug-memory",
      trackAllocations: true,
      memoryWarnings: false,
      snapshotOnExit: false,
      explainOwnership: true,
      intelligence: {
        enabled: true,
        learning: true,
        strictAnalysis: false,
      },
      predict: {
        enabled: true,
        maxPaths: 50,
        maxLoopIterations: 20,
        framesToSimulate: 5,
      },
      unity: {
        enabled: true,
        mode: "transpile",
        hotReload: false,
        outputDir: "build/unity",
      },
      sandbox: {
        enabled: false,
        allowExec: true,
        allowRust: true,
      },
    }, null, 2)}\n`,
    "utf8",
  );

  io.stdout.write(`Initialized MGL project in ${projectDirectory}\n`);
  return 0;
}

async function serveProject(filePath, options = {}) {
  const stdout = options.stdout || process.stdout;
  const stderr = options.stderr || process.stderr;
  const color = options.color ?? Boolean(stderr.isTTY);
  const watch = options.watch ?? false;
  const state = {
    app: null,
    disposed: false,
    restartTimer: null,
    watchers: [],
  };

  const closeWatchers = () => {
    state.watchers.forEach((watcher) => watcher.close());
    state.watchers = [];
  };

  const stopApp = async () => {
    if (!state.app) {
      return;
    }

    await state.app.stop();
    state.app = null;
  };

  const startServer = async (changedFile = null) => {
    const loadedConfig = loadMglConfig({
      startPath: filePath,
      overrides: {
        mode: "server",
      },
    });
    const session = createSession({
      stdout,
      stderr,
      cwd: path.dirname(filePath),
      filePath,
      config: loadedConfig.config,
    });

    await runFile(filePath, {
      stdout,
      stderr,
      session,
      cwd: path.dirname(filePath),
      config: loadedConfig.config,
    });

    const app = session.interpreter.shared.defaultServer;
    if (!app) {
      throw new Error(`No server declaration found in ${filePath}.`);
    }

    await resolveFuture(app.start({ port: loadedConfig.config.port, host: "127.0.0.1" }));
    state.app = app;

    if (changedFile) {
      stdout.write(`Reloaded ${path.relative(process.cwd(), changedFile) || changedFile}\n`);
    }

    stdout.write(`Server listening on http://127.0.0.1:${loadedConfig.config.port}\n`);

    if (watch) {
      closeWatchers();
      const watchedFiles = new Set(checkFile(filePath).files);
      if (loadedConfig.configPath) {
        watchedFiles.add(loadedConfig.configPath);
      }

      watchedFiles.forEach((watchedFile) => {
        state.watchers.push(fs.watch(watchedFile, () => {
          if (state.disposed) {
            return;
          }

          clearTimeout(state.restartTimer);
          state.restartTimer = setTimeout(async () => {
            try {
              await stopApp();
              await startServer(watchedFile);
            } catch (error) {
              stderr.write(`${formatError(error, { color })}\n`);
            }
          }, 100);
        }));
      });
    }
  };

  await startServer();

  return new Promise((resolve) => {
    const shutdown = async () => {
      if (state.disposed) {
        return;
      }

      state.disposed = true;
      clearTimeout(state.restartTimer);
      process.off("SIGINT", shutdown);
      process.off("SIGTERM", shutdown);
      closeWatchers();

      try {
        await stopApp();
        resolve(0);
      } catch (error) {
        stderr.write(`${formatError(error, { color })}\n`);
        resolve(1);
      }
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  });
}

function resolveCliEntry(inputPath) {
  return resolveEntryFile(inputPath, { cwd: process.cwd() });
}

function analyzeEntry(inputPath) {
  const filePath = resolveCliEntry(inputPath);
  const loadedConfig = loadMglConfig({ startPath: filePath });
  return analyzeProject(filePath, {
    config: loadedConfig.config,
    rootDirectory: loadedConfig.rootDirectory,
  });
}

function buildHelpText() {
  return [
    "Magnificent Language CLI",
    "",
    "Usage:",
    "  mgl run <file.mgl>",
    "  mgl build [file.mgl] [--rust|--native|--unity]",
    "  mgl predict [file.mgl] [--game]",
    "  mgl unity [file.mgl] [--watch]",
    "  mgl analyze [file.mgl] [--graph]",
    "  mgl improve [file.mgl]",
    "  mgl explain [file.mgl]",
    "  mgl performance [file.mgl]",
    "  mgl refactor [file.mgl]",
    "  mgl health [file.mgl]",
    "  mgl serve [file.mgl] [--watch]",
    "  mgl test [api] [file.mgl]",
    "  mgl check <file.mgl>",
    "  mgl ast <file.mgl>",
    "  mgl tokens <file.mgl>",
    "  mgl memory [--live|--graph|--leaks] [file.mgl]",
    "  mgl doctor",
    "  mgl repl",
    "  mgl init <project>",
    "  mgl help",
    "  mgl version",
    "",
    "Examples:",
    "  mgl run examples/main.mgl",
    "  mgl build examples/rust-interop.mgl --rust",
    "  mgl build examples/main.mgl --native",
    "  mgl build examples/unity/player.mgl --unity",
    "  mgl predict examples/main.mgl",
    "  mgl predict --game examples/unity/player.mgl",
    "  mgl unity examples/unity/player.mgl --watch",
    "  mgl analyze examples/intelligence-demo.mgl --graph",
    "  mgl improve examples/intelligence-demo.mgl",
    "  mgl explain examples/api-server.mgl",
    "  mgl performance examples/main.mgl",
    "  mgl refactor examples/intelligence-demo.mgl",
    "  mgl health",
    "  mgl serve examples/api-server.mgl",
    "  mgl serve --watch",
    "  mgl test examples/api-server.mgl",
    "  mgl test api examples/api-server.mgl",
    "  mgl memory examples/main.mgl",
    "  mgl memory --graph examples/main.mgl",
    "  mgl check examples/main.mgl",
    "  mgl repl",
    "  mgl init demo-app",
  ].join("\n");
}

async function watchUnityBuild(filePath, outputDir, options = {}) {
  const stdout = options.stdout || process.stdout;
  const stderr = options.stderr || process.stderr;
  const color = options.color ?? Boolean(stderr.isTTY);
  const watchedFiles = new Set(checkFile(filePath).files);
  if (options.configPath) {
    watchedFiles.add(options.configPath);
  }

  let disposed = false;
  let timer = null;
  let watchers = [];

  const rebuild = (changedFile = null) => {
    const result = buildUnityProject(filePath, { outputDir });
    stdout.write(`${renderUnityBuildReport(result)}\n`);
    if (changedFile) {
      stdout.write(`Reloaded ${path.relative(process.cwd(), changedFile) || changedFile}\n`);
    }
  };

  const closeWatchers = () => {
    watchers.forEach((watcher) => watcher.close());
    watchers = [];
  };

  rebuild();
  watchedFiles.forEach((watchedFile) => {
    watchers.push(fs.watch(watchedFile, () => {
      if (disposed) {
        return;
      }

      clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          rebuild(watchedFile);
        } catch (error) {
          stderr.write(`${formatError(error, { color })}\n`);
        }
      }, 100);
    }));
  });

  return new Promise((resolve) => {
    const shutdown = () => {
      if (disposed) {
        return;
      }

      disposed = true;
      clearTimeout(timer);
      closeWatchers();
      process.off("SIGINT", shutdown);
      process.off("SIGTERM", shutdown);
      resolve(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  });
}

function binaryVersion(name) {
  const binary = findRustBinary(name) || name;
  const result = spawnSync(binary, ["--version"], { encoding: "utf8" });
  if (result.status !== 0) {
    return null;
  }

  return (result.stdout || result.stderr || "").trim();
}

module.exports = {
  buildHelpText,
  runCli,
};
