const { stringifyValue } = require("../values");

class MglHttpResponse {
  constructor(body, options = {}) {
    this.status = options.status || 200;
    this.headers = { ...(options.headers || {}) };
    this.body = body;
  }

  toNodeResponseBody() {
    if (typeof this.body === "string" || Buffer.isBuffer(this.body)) {
      return this.body;
    }

    return stringifyValue(this.body);
  }

  toString() {
    return `<http-response ${this.status}>`;
  }
}

function jsonResponse(value, status = 200) {
  return new MglHttpResponse(JSON.stringify(serializeJsonValue(value)), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function serializeJsonValue(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeJsonValue(item));
  }

  if (value && typeof value === "object" && value.fields instanceof Map) {
    const result = {};
    value.fields.forEach((fieldValue, fieldName) => {
      result[fieldName] = serializeJsonValue(fieldValue);
    });
    return result;
  }

  if (typeof value === "object" && value.constructor === Object) {
    return Object.fromEntries(Object.entries(value).map(([key, nestedValue]) => [key, serializeJsonValue(nestedValue)]));
  }

  return value;
}

module.exports = {
  MglHttpResponse,
  jsonResponse,
  serializeJsonValue,
};
