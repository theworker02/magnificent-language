const {
  MglClass,
  MglFunction,
  MglInstance,
  MglModule,
  MglRecordInstance,
  MglRecordType,
  MglTrackedScalar,
  NativeFunction,
  unwrapRuntimeValue,
} = require("./values");

const TYPE_TAG = Symbol.for("mgl.runtime.type");

const BUILTIN_TYPE_ALIASES = Object.freeze({
  any: "any",
  array: "array",
  bool: "bool",
  boolean: "bool",
  class: "class",
  future: "future",
  function: "function",
  module: "module",
  null: "null",
  num: "number",
  number: "number",
  object: "object",
  server: "server",
  str: "string",
  string: "string",
  task: "task",
  void: "void",
});

function normalizeTypeName(name) {
  return BUILTIN_TYPE_ALIASES[name] || name;
}

function namedType(name, token = null) {
  return {
    type: "NamedType",
    name: typeof name === "string" ? { lexeme: normalizeTypeName(name), line: null, column: null } : name,
    token,
  };
}

function arrayType(elementType, token = null) {
  return {
    type: "ArrayType",
    keyword: {
      lexeme: "array",
      line: token ? token.line : null,
      column: token ? token.column : null,
    },
    elementType,
  };
}

function isAnyType(typeAnnotation) {
  return !typeAnnotation
    || (
      typeAnnotation.type === "NamedType"
      && normalizeTypeName(typeAnnotation.name.lexeme) === "any"
    );
}

function isVoidType(typeAnnotation) {
  return Boolean(typeAnnotation)
    && typeAnnotation.type === "NamedType"
    && normalizeTypeName(typeAnnotation.name.lexeme) === "void";
}

function isKnownBuiltinType(name) {
  return Object.prototype.hasOwnProperty.call(BUILTIN_TYPE_ALIASES, name);
}

function stringifyType(typeAnnotation) {
  if (!typeAnnotation) {
    return "any";
  }

  if (typeAnnotation.type === "ArrayType") {
    return `array<${stringifyType(typeAnnotation.elementType)}>`;
  }

  return normalizeTypeName(typeAnnotation.name.lexeme);
}

function getTaggedType(value) {
  const rawValue = unwrapRuntimeValue(value);
  if (!Array.isArray(rawValue)) {
    return null;
  }

  return rawValue[TYPE_TAG] || null;
}

function tagValueWithType(value, typeAnnotation) {
  const rawValue = unwrapRuntimeValue(value);
  if (!Array.isArray(rawValue) || !typeAnnotation) {
    return value;
  }

  const normalized = normalizeTypeAnnotation(typeAnnotation);
  Object.defineProperty(rawValue, TYPE_TAG, {
    value: normalized,
    configurable: true,
    enumerable: false,
    writable: true,
  });

  if (normalized.type === "ArrayType") {
    for (const element of rawValue) {
      tagValueWithType(element, normalized.elementType);
    }
  }

  return value;
}

function normalizeTypeAnnotation(typeAnnotation) {
  if (!typeAnnotation) {
    return null;
  }

  if (typeAnnotation.type === "ArrayType") {
    return {
      type: "ArrayType",
      keyword: typeAnnotation.keyword,
      elementType: normalizeTypeAnnotation(typeAnnotation.elementType),
    };
  }

  return {
    type: "NamedType",
    name: {
      ...typeAnnotation.name,
      lexeme: normalizeTypeName(typeAnnotation.name.lexeme),
    },
  };
}

function matchesType(value, typeAnnotation, context = {}) {
  const rawValue = unwrapRuntimeValue(value);
  const normalized = normalizeTypeAnnotation(typeAnnotation);

  if (!normalized || isAnyType(normalized)) {
    return true;
  }

  if (normalized.type === "ArrayType") {
    return Array.isArray(rawValue)
      && rawValue.every((element) => matchesType(element, normalized.elementType, context));
  }

  const typeName = normalizeTypeName(normalized.name.lexeme);

  switch (typeName) {
    case "number":
      return typeof rawValue === "number" && !Number.isNaN(rawValue);
    case "string":
      return typeof rawValue === "string";
    case "bool":
      return typeof rawValue === "boolean";
    case "null":
      return rawValue === null;
    case "array":
      return Array.isArray(rawValue);
    case "function":
      return rawValue instanceof NativeFunction || rawValue instanceof MglFunction;
    case "class":
      return rawValue instanceof MglClass;
    case "type":
      return rawValue instanceof MglRecordType || rawValue instanceof MglClass;
    case "module":
      return rawValue instanceof MglModule;
    case "future":
      return typeof rawValue?.promise?.then === "function";
    case "task":
      return typeof rawValue?.cancel === "function" && typeof rawValue?.status === "string";
    case "server":
      return rawValue && Array.isArray(rawValue.routes) && typeof rawValue.start === "function";
    case "object":
      return rawValue instanceof MglInstance
        || rawValue instanceof MglRecordInstance
        || rawValue instanceof MglModule
        || Array.isArray(rawValue);
    case "void":
      return rawValue === null;
    default: {
      const resolvedType = context.resolveType ? context.resolveType(typeName) : null;
      if (resolvedType instanceof MglClass) {
        return rawValue instanceof MglInstance && rawValue.klass === resolvedType;
      }

      if (resolvedType instanceof MglRecordType) {
        return rawValue instanceof MglRecordInstance && rawValue.typeName === resolvedType.name;
      }

      return false;
    }
  }
}

function describeRuntimeType(value) {
  const rawValue = unwrapRuntimeValue(value);
  const taggedType = getTaggedType(rawValue);
  if (taggedType) {
    return stringifyType(taggedType);
  }

  if (rawValue === null) {
    return "null";
  }

  if (typeof rawValue === "boolean") {
    return "bool";
  }

  if (typeof rawValue === "number") {
    return "number";
  }

  if (typeof rawValue === "string") {
    return "string";
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

  if (rawValue instanceof MglModule) {
    return "module";
  }

  if (typeof rawValue?.promise?.then === "function") {
    return "future";
  }

  if (typeof rawValue?.cancel === "function" && typeof rawValue?.status === "string") {
    return "task";
  }

  if (rawValue && Array.isArray(rawValue.routes) && typeof rawValue.start === "function") {
    return "server";
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

  if (value instanceof MglTrackedScalar) {
    return describeRuntimeType(value.value);
  }

  return typeof rawValue;
}

module.exports = {
  TYPE_TAG,
  arrayType,
  describeRuntimeType,
  getTaggedType,
  isAnyType,
  isKnownBuiltinType,
  isVoidType,
  matchesType,
  namedType,
  normalizeTypeAnnotation,
  normalizeTypeName,
  stringifyType,
  tagValueWithType,
};
