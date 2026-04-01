const fs = require("fs");
const path = require("path");

const { createSession, runFile, version } = require("./index");
const { startRepl } = require("./repl/repl");
const { formatError } = require("./utils/errors");

function runCli(args, io = {}) {
  const stdin = io.stdin || process.stdin;
  const stdout = io.stdout || process.stdout;
  const stderr = io.stderr || process.stderr;
  const [command, ...rest] = args;
  const color = io.color ?? Boolean(stderr.isTTY);

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
        return handleRun(rest, { stdout, stderr });
      case "repl":
        return startRepl({
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

function handleRun(args, io) {
  if (args.length === 0) {
    io.stderr.write(`Missing source file.\n\n${buildHelpText()}\n`);
    return 1;
  }

  const filePath = path.resolve(args[0]);
  runFile(filePath, io);
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

  fs.mkdirSync(projectDirectory, { recursive: true });

  if (fs.existsSync(mainFile) || fs.existsSync(configFile)) {
    io.stderr.write(`Refusing to overwrite existing MGL project files in ${projectDirectory}.\n`);
    return 1;
  }

  fs.writeFileSync(
    mainFile,
    [
      "func main() {",
      "  print(\"Hello from Magnificent Language\")",
      "}",
      "",
      "main()",
      "",
    ].join("\n"),
    "utf8",
  );

  fs.writeFileSync(
    configFile,
    `${JSON.stringify({
      name: path.basename(projectDirectory),
      version: "1.0.0",
      entry: "main.mgl",
    }, null, 2)}\n`,
    "utf8",
  );

  io.stdout.write(`Initialized MGL project in ${projectDirectory}\n`);
  return 0;
}

function buildHelpText() {
  return [
    "Magnificent Language CLI",
    "",
    "Usage:",
    "  mgl run <file.mgl>",
    "  mgl repl",
    "  mgl init <project>",
    "  mgl help",
    "  mgl version",
    "",
    "Examples:",
    "  mgl run examples/hello.mgl",
    "  mgl run examples/classes.mgl",
    "  mgl repl",
    "  mgl init demo-app",
  ].join("\n");
}

module.exports = {
  buildHelpText,
  runCli,
};
