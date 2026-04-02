const { MglRuntimeError } = require("../utils/errors");

class Environment {
  constructor(enclosing = null, options = {}) {
    this.enclosing = enclosing;
    this.values = new Map();
    this.registry = options.registry || (enclosing ? enclosing.registry : null);
    this.scopeName = options.scopeName || (enclosing ? `${enclosing.scopeName}:child` : "global");
    this.scopeKind = options.scopeKind || "scope";
    this.id = Environment.nextId += 1;
  }

  define(name, value, options = {}) {
    const binding = {
      value,
      declaredType: options.declaredType || null,
      source: options.source || "user",
    };

    this.values.set(name, binding);

    if (this.registry && binding.source !== "stdlib") {
      this.registry.setRootReference(this, name, value, binding);
    }

    return value;
  }

  getBinding(nameOrToken, details = {}) {
    const name = typeof nameOrToken === "string" ? nameOrToken : nameOrToken.lexeme;

    if (this.values.has(name)) {
      return this.values.get(name);
    }

    if (this.enclosing) {
      return this.enclosing.getBinding(nameOrToken, details);
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

  get(nameOrToken, details = {}) {
    return this.getBinding(nameOrToken, details).value;
  }

  assign(nameOrToken, value, details = {}) {
    const name = typeof nameOrToken === "string" ? nameOrToken : nameOrToken.lexeme;

    if (this.values.has(name)) {
      const binding = this.values.get(name);
      binding.value = value;

      if (this.registry && binding.source !== "stdlib") {
        this.registry.setRootReference(this, name, value, binding);
      }

      return value;
    }

    if (this.enclosing) {
      return this.enclosing.assign(nameOrToken, value, details);
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
    return new Map(Array.from(this.values.entries(), ([name, binding]) => [name, binding.value]));
  }

  describeBindings(options = {}) {
    const includeStdlib = options.includeStdlib ?? true;

    return Array.from(this.values.entries())
      .filter(([, binding]) => includeStdlib || binding.source !== "stdlib")
      .map(([name, binding]) => ({
        name,
        value: binding.value,
        declaredType: binding.declaredType,
        source: binding.source,
      }));
  }

  dispose() {
    if (this.registry) {
      this.registry.clearScope(this.id);
    }
  }
}

Environment.nextId = 0;

module.exports = {
  Environment,
};
