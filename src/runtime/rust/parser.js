const fs = require("fs");
const path = require("path");

const { normalizeRustType } = require("../ffi");
const { MglRuntimeError } = require("../../utils/errors");

function parseRustModule(filePath) {
  const absolutePath = path.resolve(filePath);
  const source = fs.readFileSync(absolutePath, "utf8");
  const functions = [];
  const regex = /pub\s+fn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([\s\S]*?)\)\s*(?:->\s*([A-Za-z0-9_<>&'\s]+))?\s*\{/g;
  let match;

  while ((match = regex.exec(source)) !== null) {
    const [, name, rawParams, rawReturnType] = match;
    const params = splitTopLevel(rawParams, ",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const separator = entry.indexOf(":");
        if (separator === -1) {
          throw new MglRuntimeError(`Rust export '${name}' has an invalid parameter '${entry}'.`, {
            filePath: absolutePath,
          });
        }

        const paramName = entry.slice(0, separator).trim();
        const paramType = entry.slice(separator + 1).trim();
        return {
          name: paramName,
          type: normalizeRustType(paramType),
        };
      });

    const returnType = rawReturnType ? normalizeRustType(rawReturnType) : normalizeRustType("()");
    functions.push({ name, params, returnType });
  }

  if (functions.length === 0) {
    throw new MglRuntimeError(`No supported 'pub fn' exports found in Rust module '${absolutePath}'.`, {
      filePath: absolutePath,
    });
  }

  return {
    filePath: absolutePath,
    moduleName: path.basename(absolutePath, path.extname(absolutePath)).replace(/[^A-Za-z0-9_]/g, "_"),
    source,
    functions,
  };
}

function splitTopLevel(value, separator) {
  const parts = [];
  let current = "";
  let depth = 0;

  for (const character of value) {
    if (character === "<") {
      depth += 1;
    } else if (character === ">") {
      depth = Math.max(depth - 1, 0);
    }

    if (character === separator && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  if (current) {
    parts.push(current);
  }

  return parts;
}

module.exports = {
  parseRustModule,
};
