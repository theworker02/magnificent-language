const fs = require("fs");
const path = require("path");

const packageJson = require("../package.json");
const { loadMglConfig } = require("./config");
const { Interpreter } = require("./interpreter/interpreter");
const { Lexer } = require("./lexer/lexer");
const { Parser } = require("./parser/parser");

function createSession(options = {}) {
  const loadedConfig = loadMglConfig({
    startPath: options.filePath || options.cwd || process.cwd(),
    overrides: options.config || {},
  });

  return {
    config: loadedConfig.config,
    interpreter: new Interpreter({
      ...options,
      config: loadedConfig.config,
    }),
  };
}

function lexSource(source, options = {}) {
  const filePath = options.filePath || options.sourceName || "<source>";
  const lexer = new Lexer(source, { filePath });
  return lexer.tokenize();
}

function parseSource(source, options = {}) {
  const filePath = options.filePath || options.sourceName || "<source>";
  const tokens = lexSource(source, { filePath });
  const parser = new Parser(tokens, { filePath, sourceText: source });
  return parser.parse();
}

async function runSource(source, options = {}) {
  const session = options.session || createSession({
    ...options,
    filePath: options.filePath || options.sourceName || "<source>",
  });
  const filePath = options.filePath || options.sourceName || "<source>";
  const program = parseSource(source, { filePath });
  return session.interpreter.interpret(program, {
    cwd: options.cwd || session.interpreter.cwd,
    filePath,
    sourceText: source,
  });
}

function parseFile(filePath) {
  const absolutePath = path.resolve(filePath);
  const source = fs.readFileSync(absolutePath, "utf8");
  return parseSource(source, {
    filePath: absolutePath,
  });
}

async function runFile(filePath, options = {}) {
  const absolutePath = path.resolve(filePath);
  const source = fs.readFileSync(absolutePath, "utf8");
  const loadedConfig = loadMglConfig({
    startPath: absolutePath,
    overrides: options.config || {},
  });
  const session = options.session || createSession({
    ...options,
    config: loadedConfig.config,
    filePath: absolutePath,
    cwd: options.cwd || path.dirname(absolutePath),
  });
  return runSource(source, {
    ...options,
    config: loadedConfig.config,
    session,
    cwd: options.cwd || path.dirname(absolutePath),
    filePath: absolutePath,
  });
}

module.exports = {
  createSession,
  lexSource,
  parseFile,
  parseSource,
  runFile,
  runSource,
  version: packageJson.version,
};
