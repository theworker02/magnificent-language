const fs = require("fs");
const path = require("path");

const packageJson = require("../package.json");
const { Interpreter } = require("./interpreter/interpreter");
const { Lexer } = require("./lexer/lexer");
const { Parser } = require("./parser/parser");

function createSession(options = {}) {
  return {
    interpreter: new Interpreter(options),
  };
}

function runSource(source, options = {}) {
  const session = options.session || createSession(options);
  const filePath = options.filePath || options.sourceName || "<source>";
  const lexer = new Lexer(source, { filePath });
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, { filePath, sourceText: source });
  const program = parser.parse();
  return session.interpreter.interpret(program, {
    cwd: options.cwd || session.interpreter.cwd,
    filePath,
    sourceText: source,
  });
}

function runFile(filePath, options = {}) {
  const absolutePath = path.resolve(filePath);
  const source = fs.readFileSync(absolutePath, "utf8");
  const session = options.session || createSession({
    ...options,
    cwd: options.cwd || path.dirname(absolutePath),
  });
  return runSource(source, {
    ...options,
    session,
    cwd: options.cwd || path.dirname(absolutePath),
    filePath: absolutePath,
  });
}

module.exports = {
  createSession,
  runFile,
  runSource,
  version: packageJson.version,
};
