const { MglRuntimeError } = require("../utils/errors");

class Environment {
  constructor(enclosing = null) {
    this.enclosing = enclosing;
    this.values = new Map();
  }

  define(name, value) {
    this.values.set(name, value);
    return value;
  }

  get(nameOrToken, details = {}) {
    const name = typeof nameOrToken === "string" ? nameOrToken : nameOrToken.lexeme;

    if (this.values.has(name)) {
      return this.values.get(name);
    }

    if (this.enclosing) {
      return this.enclosing.get(nameOrToken);
    }

    if (typeof nameOrToken === "string") {
      throw new Error(`Undefined variable '${name}'.`);
    }

    throw new MglRuntimeError(`Undefined variable '${name}'.`, {
      filePath: details.filePath || nameOrToken.filePath || null,
      line: nameOrToken.line,
      column: nameOrToken.column,
      sourceText: details.sourceText || null,
    });
  }

  assign(nameOrToken, value, details = {}) {
    const name = typeof nameOrToken === "string" ? nameOrToken : nameOrToken.lexeme;

    if (this.values.has(name)) {
      this.values.set(name, value);
      return value;
    }

    if (this.enclosing) {
      return this.enclosing.assign(nameOrToken, value);
    }

    if (typeof nameOrToken === "string") {
      throw new Error(`Undefined variable '${name}'.`);
    }

    throw new MglRuntimeError(`Undefined variable '${name}'.`, {
      filePath: details.filePath || nameOrToken.filePath || null,
      line: nameOrToken.line,
      column: nameOrToken.column,
      sourceText: details.sourceText || null,
    });
  }

  snapshot() {
    return new Map(this.values);
  }
}

module.exports = {
  Environment,
};
