const { unwrapRuntimeValue } = require("../values");
const { MglRuntimeError } = require("../../utils/errors");

const INT_TYPES = new Set(["i32", "i64", "isize", "u32", "u64", "usize"]);
const FLOAT_TYPES = new Set(["f32", "f64"]);

function normalizeRustType(rawType) {
  const cleaned = String(rawType)
    .trim()
    .replace(/\s+/g, "")
    .replace(/&'[^']+'?str/g, "&str")
    .replace(/&'[^']+str/g, "&str");

  if (INT_TYPES.has(cleaned)) {
    return { raw: cleaned, kind: "int", rustType: cleaned, mglType: "number" };
  }

  if (FLOAT_TYPES.has(cleaned)) {
    return { raw: cleaned, kind: "float", rustType: cleaned, mglType: "number" };
  }

  if (cleaned === "String" || cleaned === "&str") {
    return { raw: cleaned, kind: "string", rustType: cleaned, mglType: "string" };
  }

  if (cleaned === "()" || cleaned === "void") {
    return { raw: cleaned, kind: "void", rustType: "()", mglType: "void" };
  }

  const vectorMatch = /^Vec<(.+)>$/.exec(cleaned);
  if (vectorMatch) {
    const elementType = normalizeRustType(vectorMatch[1]);
    if (!["int", "float", "string"].includes(elementType.kind)) {
      throw new Error(`Unsupported Rust Vec element type '${vectorMatch[1]}'.`);
    }

    return {
      raw: cleaned,
      kind: "array",
      rustType: cleaned,
      mglType: `array<${elementType.mglType}>`,
      elementType,
    };
  }

  throw new Error(`Unsupported Rust type '${rawType}'.`);
}

function encodeRustArgument(value, typeDescriptor) {
  const rawValue = unwrapRuntimeValue(value);

  switch (typeDescriptor.kind) {
    case "int": {
      if (typeof rawValue !== "number" || Number.isNaN(rawValue)) {
        throw new MglRuntimeError(`Rust FFI expected ${typeDescriptor.rustType}, received ${typeof rawValue}.`);
      }

      return `i:${Math.trunc(rawValue)}`;
    }
    case "float": {
      if (typeof rawValue !== "number" || Number.isNaN(rawValue)) {
        throw new MglRuntimeError(`Rust FFI expected ${typeDescriptor.rustType}, received ${typeof rawValue}.`);
      }

      return `f:${rawValue}`;
    }
    case "string": {
      if (typeof rawValue !== "string") {
        throw new MglRuntimeError(`Rust FFI expected string, received ${typeof rawValue}.`);
      }

      return `s:${hexEncode(rawValue)}`;
    }
    case "array": {
      if (!Array.isArray(rawValue)) {
        throw new MglRuntimeError(`Rust FFI expected ${typeDescriptor.mglType}, received ${typeof rawValue}.`);
      }

      if (typeDescriptor.elementType.kind === "int") {
        return `ai:${rawValue.map((item) => Math.trunc(Number(unwrapRuntimeValue(item)))).join(",")}`;
      }

      if (typeDescriptor.elementType.kind === "float") {
        return `af:${rawValue.map((item) => Number(unwrapRuntimeValue(item))).join(",")}`;
      }

      return `as:${rawValue.map((item) => hexEncode(String(unwrapRuntimeValue(item)))).join(";")}`;
    }
    default:
      throw new MglRuntimeError(`Cannot encode unsupported Rust type '${typeDescriptor.raw}'.`);
  }
}

function decodeRustResult(payload) {
  if (payload === "v:") {
    return null;
  }

  if (payload.startsWith("e:")) {
    throw new MglRuntimeError(hexDecode(payload.slice(2)));
  }

  if (payload.startsWith("i:")) {
    return Number.parseInt(payload.slice(2), 10);
  }

  if (payload.startsWith("f:")) {
    return Number.parseFloat(payload.slice(2));
  }

  if (payload.startsWith("s:")) {
    return hexDecode(payload.slice(2));
  }

  if (payload.startsWith("ai:")) {
    const body = payload.slice(3);
    return body === "" ? [] : body.split(",").filter(Boolean).map((item) => Number.parseInt(item, 10));
  }

  if (payload.startsWith("af:")) {
    const body = payload.slice(3);
    return body === "" ? [] : body.split(",").filter(Boolean).map((item) => Number.parseFloat(item));
  }

  if (payload.startsWith("as:")) {
    const body = payload.slice(3);
    return body === "" ? [] : body.split(";").filter(Boolean).map((item) => hexDecode(item));
  }

  throw new MglRuntimeError(`Unknown Rust bridge payload '${payload}'.`);
}

function hexEncode(value) {
  return Buffer.from(String(value), "utf8").toString("hex");
}

function hexDecode(value) {
  return Buffer.from(String(value), "hex").toString("utf8");
}

module.exports = {
  decodeRustResult,
  encodeRustArgument,
  hexDecode,
  hexEncode,
  normalizeRustType,
};
