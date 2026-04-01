const fs = require("fs");
const path = require("path");

class MglError extends Error {
  constructor(name, message, details = {}) {
    super(message);
    this.name = name;
    this.filePath = details.filePath || null;
    this.line = details.line || null;
    this.column = details.column || null;
    this.sourceText = details.sourceText || null;
  }
}

class MglLexError extends MglError {
  constructor(message, details = {}) {
    super("MGL LexError", message, details);
  }
}

class MglParseError extends MglError {
  constructor(message, details = {}) {
    super("MGL ParseError", message, details);
  }
}

class MglRuntimeError extends MglError {
  constructor(message, details = {}) {
    super("MGL RuntimeError", message, details);
  }
}

function formatLocation(error) {
  const filePath = error.filePath
    ? path.isAbsolute(error.filePath)
      ? path.relative(process.cwd(), error.filePath) || error.filePath
      : error.filePath
    : "<source>";

  if (error.line && error.column) {
    return `${filePath}:${error.line}:${error.column}`;
  }

  if (error.line) {
    return `${filePath}:${error.line}`;
  }

  return filePath;
}

function formatError(error, options = {}) {
  const color = options.color ?? false;

  if (error instanceof MglError) {
    const lines = [
      `${colorize(error.name, "31;1", color)}: ${error.message}`,
      `${colorize("->", "36", color)} ${formatLocation(error)}`,
    ];
    const snippet = formatSnippet(error, color);

    if (snippet) {
      lines.push(snippet);
    }

    return lines.join("\n");
  }

  return error && error.message ? error.message : String(error);
}

function formatSnippet(error, color) {
  if (!error.line || !error.column) {
    return "";
  }

  const sourceText = getSourceText(error);
  if (!sourceText) {
    return "";
  }

  const lines = sourceText.replace(/\r\n/g, "\n").split("\n");
  const lineText = lines[error.line - 1];
  if (lineText === undefined) {
    return "";
  }

  const lineNumber = String(error.line);
  const gutter = colorize(`${lineNumber} |`, "2", color);
  const caretGutter = colorize(`${" ".repeat(lineNumber.length)} |`, "2", color);
  const caret = `${" ".repeat(Math.max(error.column - 1, 0))}${colorize("^", "31;1", color)}`;
  return `${gutter} ${lineText}\n${caretGutter} ${caret}`;
}

function getSourceText(error) {
  if (error.sourceText) {
    return error.sourceText;
  }

  if (!error.filePath || !path.isAbsolute(error.filePath) || !fs.existsSync(error.filePath)) {
    return null;
  }

  try {
    return fs.readFileSync(error.filePath, "utf8");
  } catch (_error) {
    return null;
  }
}

function colorize(text, ansiCode, enabled) {
  if (!enabled) {
    return text;
  }

  return `\u001b[${ansiCode}m${text}\u001b[0m`;
}

module.exports = {
  MglError,
  MglLexError,
  MglParseError,
  MglRuntimeError,
  formatError,
  formatLocation,
};
