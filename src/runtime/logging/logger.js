const { runtimeValueFromJs, stringifyValue } = require("../values");

function createLogger(options = {}) {
  const stdout = options.stdout || process.stdout;
  const stderr = options.stderr || process.stderr;

  return runtimeValueFromJs({
    info: createLogFunction(stdout, "INFO"),
    warn: createLogFunction(stdout, "WARN"),
    error: createLogFunction(stderr, "ERROR"),
    debug: createLogFunction(stdout, "DEBUG"),
  }, { anonymous: true });
}

function createLogFunction(stream, level) {
  return {
    call(_interpreter, args) {
      const [message, meta] = args;
      const timestamp = new Date().toISOString();
      const renderedMeta = meta === undefined ? "" : ` ${renderMeta(meta)}`;
      stream.write(`[${timestamp}] [${level}] ${stringifyValue(message)}${renderedMeta}\n`);
      return null;
    },
    acceptsArgs(count) {
      return count >= 1 && count <= 2;
    },
    arityDescription() {
      return "1-2";
    },
    toString() {
      return `<native log.${level.toLowerCase()}>`;
    },
  };
}

function renderMeta(meta) {
  if (meta && meta.fields instanceof Map) {
    const object = {};
    meta.fields.forEach((value, key) => {
      object[key] = stringifyValue(value);
    });
    return JSON.stringify(object);
  }

  return stringifyValue(meta);
}

module.exports = {
  createLogger,
};
