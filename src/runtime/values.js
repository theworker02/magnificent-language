const { Environment } = require("./environment");
const { MglFuture, isFuture, resolveFuture } = require("./async");
const { MglTaskHandle } = require("./tasks");
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
    this.isAsync = options.isAsync ?? false;
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
    const result = this.implementation(interpreter, args);

    if (this.isAsync) {
      return new MglFuture(result, { label: this.name });
    }

    return result;
  }

  toString() {
    return `<native ${this.name}>`;
  }
}

class MglTrackedScalar {
  constructor(value, allocationId = null) {
    this.value = value;
    this.allocationId = allocationId;
  }

  valueOf() {
    return this.value;
  }

  toString() {
    return String(this.value);
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
    const environment = new Environment(this.closure, {
      registry: this.closure.registry || null,
      scopeName: `method ${this.declaration.name.lexeme}`,
      scopeKind: "function",
    });
    environment.define("self", instance, { source: "user" });
    return new MglFunction(this.declaration, environment, this.isInitializer);
  }

  call(interpreter, args) {
    const promise = interpreter.invokeFunction(this, args);
    return this.declaration.isAsync
      ? new MglFuture(promise, { label: `func:${this.declaration.name.lexeme}` })
      : promise;
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
    return interpreter.invokeClass(this, args);
  }

  toString() {
    return `<class ${this.name}>`;
  }
}

class MglRecordType {
  constructor(name, fields = []) {
    this.name = name;
    this.fields = new Map(fields.map((field) => [field.name.lexeme, field]));
  }

  getField(name) {
    return this.fields.get(name) || null;
  }

  toString() {
    return `<type ${this.name}>`;
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

class MglObjectBase {
  constructor(typeName, options = {}) {
    this.typeName = typeName;
    this.fields = new Map();
    this.anonymous = options.anonymous ?? false;
  }

  get(nameToken, filePath = null) {
    const name = nameToken.lexeme;

    if (this.fields.has(name)) {
      return this.fields.get(name);
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
}

class MglInstance extends MglObjectBase {
  constructor(klass) {
    super(klass.name);
    this.klass = klass;
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

  toString() {
    return `<${this.klass.name} instance>`;
  }
}

class MglRecordInstance extends MglObjectBase {
  constructor(typeName, options = {}) {
    super(typeName, options);
    this.schema = options.schema || null;
  }

  toString() {
    return this.anonymous ? "<object>" : `<${this.typeName}>`;
  }
}

function isCallable(value) {
  const rawValue = unwrapRuntimeValue(value);
  return rawValue && typeof rawValue.call === "function" && typeof rawValue.acceptsArgs === "function";
}

function unwrapRuntimeValue(value) {
  return value instanceof MglTrackedScalar ? value.value : value;
}

function runtimeValueFromJs(value, options = {}) {
  if (
    value instanceof MglRecordInstance
    || value instanceof MglTrackedScalar
    || value instanceof MglFuture
    || value instanceof MglTaskHandle
    || isCallable(value)
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => runtimeValueFromJs(item, options));
  }

  if (value && typeof value === "object") {
    const record = new MglRecordInstance(options.typeName || "object", {
      anonymous: options.anonymous ?? true,
      schema: options.schema || null,
    });

    Object.entries(value).forEach(([key, nestedValue]) => {
      record.fields.set(key, runtimeValueFromJs(nestedValue, { anonymous: true }));
    });
    return record;
  }

  return value;
}

function stringifyValue(value, seen = new Set()) {
  if (value instanceof MglTrackedScalar) {
    return stringifyValue(value.value, seen);
  }

  if (value === null) {
    return "null";
  }

  if (typeof value === "number") {
    return String(value);
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return "[<cycle>]";
    }

    seen.add(value);
    const rendered = `[${value.map((item) => stringifyValue(item, seen)).join(", ")}]`;
    seen.delete(value);
    return rendered;
  }

  if (value instanceof MglRecordInstance || value instanceof MglInstance) {
    if (seen.has(value)) {
      return value instanceof MglRecordInstance && value.anonymous ? "{<cycle>}" : `${value.typeName} {<cycle>}`;
    }

    seen.add(value);
    const body = Array.from(value.fields.entries())
      .map(([key, fieldValue]) => `${key}: ${stringifyValue(fieldValue, seen)}`)
      .join(", ");
    seen.delete(value);

    if (value instanceof MglRecordInstance && value.anonymous) {
      return `{ ${body} }`;
    }

    return `${value.typeName} { ${body} }`;
  }

  if (
    value instanceof MglClass
    || value instanceof MglFunction
    || value instanceof NativeFunction
    || value instanceof MglModule
    || value instanceof MglRecordType
    || value instanceof MglFuture
    || value instanceof MglTaskHandle
  ) {
    return value.toString();
  }

  return String(value);
}

function typeOfValue(value) {
  const rawValue = unwrapRuntimeValue(value);

  if (rawValue === null) {
    return "null";
  }

  if (rawValue instanceof NativeFunction) {
    return "native-function";
  }

  if (rawValue instanceof MglFunction) {
    return "function";
  }

  if (rawValue instanceof MglClass) {
    return "class";
  }

  if (rawValue instanceof MglRecordType) {
    return "type";
  }

  if (rawValue instanceof MglFuture) {
    return "future";
  }

  if (rawValue instanceof MglTaskHandle) {
    return "task";
  }

  if (rawValue instanceof MglModule) {
    return "module";
  }

  if (rawValue instanceof MglInstance) {
    return rawValue.klass.name;
  }

  if (rawValue instanceof MglRecordInstance) {
    return rawValue.typeName;
  }

  if (Array.isArray(rawValue)) {
    return "array";
  }

  return typeof rawValue;
}

module.exports = {
  MglClass,
  MglFunction,
  MglInstance,
  MglModule,
  MglRecordInstance,
  MglRecordType,
  MglTrackedScalar,
  NativeFunction,
  ReturnSignal,
  isCallable,
  isFuture,
  resolveFuture,
  runtimeValueFromJs,
  stringifyValue,
  typeOfValue,
  unwrapRuntimeValue,
};
