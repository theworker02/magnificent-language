const { Environment } = require("./environment");
const { MglRuntimeError } = require("../utils/errors");

class ReturnSignal {
  constructor(value) {
    this.value = value;
  }
}

class NativeFunction {
  constructor(name, implementation, options = {}) {
    this.name = name;
    this.implementation = implementation;
    this.exactArity = options.arity ?? null;
    this.minArity = options.minArity ?? null;
    this.maxArity = options.maxArity ?? null;
  }

  acceptsArgs(count) {
    if (this.exactArity !== null) {
      return count === this.exactArity;
    }

    const min = this.minArity ?? 0;
    const max = this.maxArity ?? Number.POSITIVE_INFINITY;
    return count >= min && count <= max;
  }

  arityDescription() {
    if (this.exactArity !== null) {
      return `${this.exactArity}`;
    }

    const min = this.minArity ?? 0;
    const max = this.maxArity ?? Number.POSITIVE_INFINITY;

    if (max === Number.POSITIVE_INFINITY) {
      return `${min}+`;
    }

    if (min === max) {
      return `${min}`;
    }

    return `${min}-${max}`;
  }

  call(interpreter, args) {
    return this.implementation(interpreter, args);
  }

  toString() {
    return `<native ${this.name}>`;
  }
}

class MglFunction {
  constructor(declaration, closure, isInitializer = false) {
    this.declaration = declaration;
    this.closure = closure;
    this.isInitializer = isInitializer;
  }

  acceptsArgs(count) {
    return count === this.declaration.params.length;
  }

  arityDescription() {
    return `${this.declaration.params.length}`;
  }

  bind(instance) {
    const environment = new Environment(this.closure);
    environment.define("self", instance);
    return new MglFunction(this.declaration, environment, this.isInitializer);
  }

  call(interpreter, args) {
    const environment = new Environment(this.closure);

    this.declaration.params.forEach((param, index) => {
      environment.define(param.lexeme, args[index]);
    });

    const previousFunctionDepth = interpreter.functionDepth;
    interpreter.functionDepth += 1;

    try {
      interpreter.executeBlock(this.declaration.body.statements, environment);
    } catch (error) {
      if (error instanceof ReturnSignal) {
        if (this.isInitializer) {
          return environment.get("self");
        }

        return error.value;
      }

      throw error;
    } finally {
      interpreter.functionDepth = previousFunctionDepth;
    }

    if (this.isInitializer) {
      return environment.get("self");
    }

    return null;
  }

  toString() {
    return `<func ${this.declaration.name.lexeme}>`;
  }
}

class MglClass {
  constructor(name, methods) {
    this.name = name;
    this.methods = methods;
  }

  findMethod(name) {
    return this.methods.get(name) || null;
  }

  acceptsArgs(count) {
    const initializer = this.findMethod("init");
    return initializer ? initializer.acceptsArgs(count) : count === 0;
  }

  arityDescription() {
    const initializer = this.findMethod("init");
    return initializer ? initializer.arityDescription() : "0";
  }

  call(interpreter, args) {
    const instance = new MglInstance(this);
    const initializer = this.findMethod("init");

    if (initializer) {
      initializer.bind(instance).call(interpreter, args);
    }

    return instance;
  }

  toString() {
    return `<class ${this.name}>`;
  }
}

class MglModule {
  constructor(name, filePath = null) {
    this.name = name;
    this.filePath = filePath;
    this.exports = new Map();
  }

  setExports(exportsMap) {
    this.exports = new Map(exportsMap);
  }

  get(nameToken, details = {}) {
    const name = nameToken.lexeme;

    if (this.exports.has(name)) {
      return this.exports.get(name);
    }

    throw new MglRuntimeError(`Module '${this.name}' does not export '${name}'.`, {
      filePath: details.filePath || nameToken.filePath || this.filePath,
      line: nameToken.line,
      column: nameToken.column,
      sourceText: details.sourceText || null,
    });
  }

  toString() {
    return `<module ${this.name}>`;
  }
}

class MglInstance {
  constructor(klass) {
    this.klass = klass;
    this.fields = new Map();
  }

  get(nameToken, filePath = null) {
    const name = nameToken.lexeme;

    if (this.fields.has(name)) {
      return this.fields.get(name);
    }

    const method = this.klass.findMethod(name);
    if (method) {
      return method.bind(this);
    }

    throw new MglRuntimeError(`Undefined property '${name}'.`, {
      filePath,
      line: nameToken.line,
      column: nameToken.column,
    });
  }

  set(nameToken, value) {
    this.fields.set(nameToken.lexeme, value);
    return value;
  }

  toString() {
    return `<${this.klass.name} instance>`;
  }
}

function isCallable(value) {
  return value && typeof value.call === "function" && typeof value.acceptsArgs === "function";
}

function stringifyValue(value) {
  if (value === null) {
    return "null";
  }

  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : String(value);
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stringifyValue(item)).join(", ")}]`;
  }

  if (
    value instanceof MglClass
    || value instanceof MglFunction
    || value instanceof NativeFunction
    || value instanceof MglInstance
    || value instanceof MglModule
  ) {
    return value.toString();
  }

  return String(value);
}

function typeOfValue(value) {
  if (value === null) {
    return "null";
  }

  if (value instanceof NativeFunction) {
    return "native-function";
  }

  if (value instanceof MglFunction) {
    return "function";
  }

  if (value instanceof MglClass) {
    return "class";
  }

  if (value instanceof MglModule) {
    return "module";
  }

  if (value instanceof MglInstance) {
    return value.klass.name;
  }

  if (Array.isArray(value)) {
    return "array";
  }

  return typeof value;
}

module.exports = {
  MglClass,
  MglFunction,
  MglInstance,
  MglModule,
  NativeFunction,
  ReturnSignal,
  isCallable,
  stringifyValue,
  typeOfValue,
};
