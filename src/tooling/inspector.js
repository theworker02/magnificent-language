const fs = require("fs");
const path = require("path");

const { Lexer } = require("../lexer/lexer");
const { Parser } = require("../parser/parser");
const { MglRuntimeError } = require("../utils/errors");

function inspectFile(filePath) {
  const absolutePath = path.resolve(filePath);
  const source = fs.readFileSync(absolutePath, "utf8");
  const lexer = new Lexer(source, { filePath: absolutePath });
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, { filePath: absolutePath, sourceText: source });
  const program = parser.parse();

  return {
    filePath: absolutePath,
    source,
    tokens,
    program,
  };
}

function checkFile(filePath) {
  const visited = new Set();
  walkFile(path.resolve(filePath), visited);
  return {
    files: Array.from(visited),
  };
}

function inspectProject(filePath) {
  const files = checkFile(filePath).files;
  const inspectedFiles = files.map((resolvedPath) => inspectFile(resolvedPath));
  return {
    entryFile: path.resolve(filePath),
    files: inspectedFiles,
  };
}

function renderTokens(tokens) {
  return tokens
    .map((token) => {
      const lexeme = token.lexeme === "" ? "<eof>" : JSON.stringify(token.lexeme);
      const literal = token.literal === null ? "" : ` literal=${JSON.stringify(token.literal)}`;
      return `${token.line}:${token.column} ${token.type} ${lexeme}${literal}`;
    })
    .join("\n");
}

function renderAst(program) {
  return JSON.stringify(program, null, 2);
}

function walkFile(filePath, visited) {
  if (visited.has(filePath)) {
    return;
  }

  visited.add(filePath);
  const { program } = inspectFile(filePath);
  const importStatements = collectImports(program);

  for (const importStatement of importStatements) {
    const dependencyPath = resolveImportPath(
      filePath,
      importStatement.source.literal,
      importStatement.importKind || "mgl",
    );
    if (!fs.existsSync(dependencyPath)) {
      throw new MglRuntimeError(`Cannot find module '${importStatement.source.literal}'.`, {
        filePath,
        line: importStatement.source.line,
        column: importStatement.source.column,
      });
    }

    if ((importStatement.importKind || "mgl") === "mgl") {
      walkFile(dependencyPath, visited);
    }
  }
}

function collectImports(node, imports = []) {
  if (!node || typeof node !== "object") {
    return imports;
  }

  if (Array.isArray(node)) {
    for (const child of node) {
      collectImports(child, imports);
    }
    return imports;
  }

  if (node.type === "ImportStatement") {
    imports.push(node);
  }

  for (const value of Object.values(node)) {
    if (value && typeof value === "object") {
      collectImports(value, imports);
    }
  }

  return imports;
}

function resolveImportPath(fromFile, specifier, importKind = "mgl") {
  const requestedPath = path.isAbsolute(specifier)
    ? specifier
    : path.resolve(path.dirname(fromFile), specifier);

  if (path.extname(requestedPath)) {
    return requestedPath;
  }

  return `${requestedPath}.${importKind === "rust" ? "rs" : "mgl"}`;
}

module.exports = {
  checkFile,
  collectImports,
  inspectFile,
  inspectProject,
  renderAst,
  renderTokens,
  resolveImportPath,
};
