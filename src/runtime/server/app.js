const http = require("http");
const { MglFuture } = require("../async");
const { MglHttpResponse, serializeJsonValue } = require("../http");
const {
  MglRecordInstance,
  NativeFunction,
  runtimeValueFromJs,
  stringifyValue,
  unwrapRuntimeValue,
} = require("../values");

class MglRoute {
  constructor(pathValue, method, body, closure) {
    this.path = pathValue;
    this.method = (method || "GET").toUpperCase();
    this.body = body;
    this.closure = closure;
  }

  matches(request) {
    return this.path === request.path && this.method === request.method.toUpperCase();
  }
}

class MglMiddleware {
  constructor(body, closure) {
    this.body = body;
    this.closure = closure;
  }
}

class MglServerApp {
  constructor(interpreter, routes = [], middleware = []) {
    this.interpreter = interpreter;
    this.routes = routes;
    this.middleware = middleware;
    this.server = null;
    this.port = null;
  }

  async handle(requestInfo) {
    const responseState = {
      status: 200,
      headers: {},
      body: null,
      contentType: null,
      explicitBody: false,
    };

    for (const layer of this.middleware) {
      await this.interpreter.executeSpecialBlock(layer.body, layer.closure, {
        scopeName: `middleware ${requestInfo.path}`,
        bindings: {
          request: buildRequestRecord(requestInfo),
          response: buildResponseRecord(responseState),
        },
      });
    }

    const route = this.routes.find((candidate) => candidate.matches(requestInfo));
    if (!route) {
      return new MglHttpResponse("Not Found", {
        status: 404,
        headers: {
          "content-type": "text/plain; charset=utf-8",
        },
      });
    }

    const value = await this.interpreter.executeSpecialBlock(route.body, route.closure, {
      scopeName: `route ${route.method} ${route.path}`,
      bindings: {
        request: buildRequestRecord(requestInfo),
        response: buildResponseRecord(responseState),
      },
      allowReturn: true,
    });

    return coerceRouteResult(value, responseState);
  }

  start(options = {}) {
    const port = options.port || 3000;
    const host = options.host || "127.0.0.1";
    this.port = port;

    const nodeServer = http.createServer(async (req, res) => {
      try {
        const body = await readBody(req);
        const requestInfo = {
          method: req.method || "GET",
          path: new URL(req.url || "/", `http://${req.headers.host || "localhost"}`).pathname,
          headers: req.headers,
          query: Object.fromEntries(new URL(req.url || "/", `http://${req.headers.host || "localhost"}`).searchParams.entries()),
          body,
        };

        const result = await this.handle(requestInfo);
        res.statusCode = result.status;
        Object.entries(result.headers).forEach(([key, value]) => {
          res.setHeader(key, value);
        });
        res.end(result.toNodeResponseBody());
      } catch (error) {
        res.statusCode = 500;
        res.setHeader("content-type", "text/plain; charset=utf-8");
        res.end(error && error.message ? error.message : String(error));
      }
    });

    this.server = nodeServer;

    return new MglFuture(new Promise((resolve, reject) => {
      const handleError = (error) => {
        nodeServer.off("listening", handleListening);
        reject(error);
      };
      const handleListening = () => {
        nodeServer.off("error", handleError);
        resolve(this);
      };

      nodeServer.once("error", handleError);
      nodeServer.once("listening", handleListening);
      nodeServer.listen(port, host);
    }), { label: `server:${port}` });
  }

  async stop() {
    if (!this.server) {
      return null;
    }

    const server = this.server;
    this.server = null;
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    return null;
  }

  toString() {
    return `<server ${this.port || "stopped"}>`;
  }
}

function buildRequestRecord(requestInfo) {
  const bodyText = requestInfo.body || "";
  let json = null;

  try {
    json = bodyText ? JSON.parse(bodyText) : null;
  } catch (_error) {
    json = null;
  }

  return runtimeValueFromJs({
    method: requestInfo.method,
    path: requestInfo.path,
    headers: requestInfo.headers,
    query: requestInfo.query,
    body: bodyText,
    json,
  }, { anonymous: true });
}

function buildResponseRecord(responseState) {
  const response = new MglRecordInstance("response", { anonymous: true });

  const sync = () => {
    response.fields.set("statusCode", responseState.status);
    response.fields.set("headers", runtimeValueFromJs({ ...responseState.headers }, { anonymous: true }));
  };

  response.fields.set("status", new NativeFunction(
    "response.status",
    (_interpreter, args) => {
      responseState.status = Number(unwrapRuntimeValue(args[0]));
      sync();
      return response;
    },
    { arity: 1 },
  ));
  response.fields.set("header", new NativeFunction(
    "response.header",
    (_interpreter, args) => {
      const key = String(unwrapRuntimeValue(args[0])).toLowerCase();
      const value = String(unwrapRuntimeValue(args[1]));
      responseState.headers[key] = value;
      sync();
      return response;
    },
    { arity: 2 },
  ));
  response.fields.set("json", new NativeFunction(
    "response.json",
    (_interpreter, args) => {
      if (args.length > 1) {
        responseState.status = Number(unwrapRuntimeValue(args[1]));
      }
      responseState.body = args[0];
      responseState.contentType = "json";
      responseState.explicitBody = true;
      sync();
      return null;
    },
    { minArity: 1, maxArity: 2 },
  ));
  response.fields.set("text", new NativeFunction(
    "response.text",
    (_interpreter, args) => {
      if (args.length > 1) {
        responseState.status = Number(unwrapRuntimeValue(args[1]));
      }
      responseState.body = stringifyValue(args[0]);
      responseState.contentType = "text";
      responseState.explicitBody = true;
      sync();
      return null;
    },
    { minArity: 1, maxArity: 2 },
  ));
  response.fields.set("send", new NativeFunction(
    "response.send",
    (_interpreter, args) => {
      if (args.length > 1) {
        responseState.status = Number(unwrapRuntimeValue(args[1]));
      }
      responseState.body = args[0];
      responseState.contentType = "value";
      responseState.explicitBody = true;
      sync();
      return null;
    },
    { minArity: 1, maxArity: 2 },
  ));

  sync();
  return response;
}

function coerceRouteResult(value, responseState) {
  const rawValue = unwrapRuntimeValue(value);

  if (rawValue instanceof MglHttpResponse) {
    return rawValue;
  }

  if (rawValue !== null && rawValue !== undefined) {
    return fromValue(rawValue, responseState);
  }

  if (responseState.explicitBody) {
    return fromExplicitBody(responseState);
  }

  return new MglHttpResponse("", {
    status: responseState.status === 200 ? 204 : responseState.status,
    headers: responseState.headers,
  });
}

function fromValue(rawValue, responseState) {
  if (typeof rawValue === "string") {
    return new MglHttpResponse(rawValue, {
      status: responseState.status,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        ...responseState.headers,
      },
    });
  }

  if (rawValue && typeof rawValue === "object") {
    return new MglHttpResponse(JSON.stringify(serializeJsonValue(rawValue)), {
      status: responseState.status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        ...responseState.headers,
      },
    });
  }

  return new MglHttpResponse(stringifyValue(rawValue), {
    status: responseState.status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      ...responseState.headers,
    },
  });
}

function fromExplicitBody(responseState) {
  if (responseState.contentType === "json") {
    return new MglHttpResponse(JSON.stringify(serializeJsonValue(responseState.body)), {
      status: responseState.status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        ...responseState.headers,
      },
    });
  }

  if (responseState.contentType === "text") {
    return new MglHttpResponse(String(responseState.body ?? ""), {
      status: responseState.status,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        ...responseState.headers,
      },
    });
  }

  return new MglHttpResponse(stringifyValue(responseState.body), {
    status: responseState.status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      ...responseState.headers,
    },
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    req.on("data", (chunk) => {
      chunks.push(chunk);
      if (Buffer.concat(chunks).length > 1024 * 1024) {
        reject(new Error("Request body too large."));
      }
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

module.exports = {
  MglMiddleware,
  MglRoute,
  MglServerApp,
};
