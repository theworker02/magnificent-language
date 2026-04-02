const { MglFuture } = require("../async");
const { runtimeValueFromJs } = require("../values");
const { serializeJsonValue } = require("./response");
const { MglRuntimeError } = require("../../utils/errors");

function createHttpClient(interpreter) {
  return {
    get(url, options = {}) {
      return request(interpreter, "GET", url, options);
    },
    post(url, body = null, options = {}) {
      return request(interpreter, "POST", url, { ...options, body });
    },
    request(method, url, options = {}) {
      return request(interpreter, method, url, options);
    },
  };
}

function request(interpreter, method, url, options = {}) {
  return new MglFuture(
    performRequest(interpreter, method, url, normalizeOptions(options)),
    { label: `http:${method}:${url}` },
  );
}

async function performRequest(_interpreter, method, url, options = {}) {
  const init = {
    method,
    headers: normalizeHeaders(options.headers),
  };

  if (options.body !== undefined && options.body !== null) {
    if (typeof options.body === "string" || Buffer.isBuffer(options.body)) {
      init.body = options.body;
    } else {
      init.body = JSON.stringify(serializeJsonValue(options.body));
      init.headers["content-type"] = init.headers["content-type"] || "application/json";
    }
  }

  const response = await fetch(url, init);
  const text = await response.text();
  let json = null;

  if ((response.headers.get("content-type") || "").includes("application/json")) {
    try {
      json = JSON.parse(text);
    } catch (_error) {
      json = null;
    }
  }

  return runtimeValueFromJs({
    status: response.status,
    ok: response.ok,
    body: text,
    json,
    headers: Object.fromEntries(response.headers.entries()),
  }, { anonymous: true });
}

function normalizeHeaders(headers) {
  if (!headers) {
    return {};
  }

  if (headers.fields instanceof Map) {
    const normalized = {};
    headers.fields.forEach((fieldValue, fieldName) => {
      normalized[fieldName.toLowerCase()] = String(fieldValue);
    });
    return normalized;
  }

  if (typeof headers === "object") {
    return Object.fromEntries(
      Object.entries(headers).map(([key, value]) => [key.toLowerCase(), String(value)]),
    );
  }

  throw new MglRuntimeError("HTTP headers must be an object or record.");
}

function normalizeOptions(options) {
  if (!options || typeof options !== "object") {
    return {};
  }

  if (options.fields instanceof Map) {
    const normalized = {};
    options.fields.forEach((fieldValue, fieldName) => {
      normalized[fieldName] = fieldValue && fieldValue.fields instanceof Map
        ? normalizeOptions(fieldValue)
        : fieldValue;
    });
    return normalized;
  }

  return options;
}

module.exports = {
  createHttpClient,
};
