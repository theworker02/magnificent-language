const fs = require("fs");
const path = require("path");

const { Environment } = require("../runtime/environment");
const { createGlobalEnvironment } = require("../runtime/stdlib");
const {
  describeRuntimeType,
  getTaggedType,
  matchesType,
  namedType,
  normalizeTypeAnnotation,
  stringifyType,
  tagValueWithType,
} = require("../runtime/types");
const {
  buildOptimizationHints,
  createMemoryRegistry,
  explainAllocation,
  inspectValue,
} = require("../runtime/memory");
const { MglFuture, isFuture, resolveFuture } = require("../runtime/async");
const { createHttpClient } = require("../runtime/http");
const { createSystemApi } = require("../runtime/system");
const { createLogger } = require("../runtime/logging");
const { loadRustModule } = require("../runtime/rust");
const { MglMiddleware, MglRoute, MglServerApp } = require("../runtime/server");
const { TaskManager, MglTaskHandle } = require("../runtime/tasks");
const { Lexer } = require("../lexer/lexer");
const { Parser } = require("../parser/parser");
const {
  MglClass,
  MglFunction,
  MglInstance,
  MglModule,
  MglRecordInstance,
  MglRecordType,
  NativeFunction,
  ReturnSignal,
  isCallable,
  runtimeValueFromJs,
  stringifyValue,
  unwrapRuntimeValue,
} = require("../runtime/values");
const { TokenType } = require("../lexer/token");
const { MglRuntimeError } = require("../utils/errors");

class Interpreter {
  constructor(options = {}) {
    this.stdout = options.stdout || process.stdout;
    this.stderr = options.stderr || process.stderr;
    this.config = {
      mode: options.config?.mode || options.mode || "script",
      port: options.config?.port || options.port || 3000,
      strictTypes: options.config?.strictTypes ?? options.strictTypes ?? false,
      optimize: options.config?.optimize ?? options.optimize ?? false,
      memoryMode: options.config?.memoryMode || options.memoryMode || "balanced",
      trackAllocations: options.config?.trackAllocations ?? options.trackAllocations ?? false,
      memoryWarnings: options.config?.memoryWarnings ?? options.memoryWarnings ?? false,
      snapshotOnExit: options.config?.snapshotOnExit ?? options.snapshotOnExit ?? false,
      explainOwnership: options.config?.explainOwnership ?? options.explainOwnership ?? true,
      intelligence: {
        enabled: options.config?.intelligence?.enabled ?? true,
        learning: options.config?.intelligence?.learning ?? true,
        strictAnalysis: options.config?.intelligence?.strictAnalysis ?? false,
      },
      predict: {
        enabled: options.config?.predict?.enabled ?? true,
        maxPaths: options.config?.predict?.maxPaths ?? 50,
        maxLoopIterations: options.config?.predict?.maxLoopIterations ?? 20,
        framesToSimulate: options.config?.predict?.framesToSimulate ?? 5,
      },
      unity: {
        enabled: options.config?.unity?.enabled ?? true,
        mode: options.config?.unity?.mode || "transpile",
        hotReload: options.config?.unity?.hotReload ?? false,
        outputDir: options.config?.unity?.outputDir || "build/unity",
      },
      sandbox: {
        enabled: options.config?.sandbox?.enabled ?? false,
        allowExec: options.config?.sandbox?.allowExec ?? true,
        allowRust: options.config?.sandbox?.allowRust ?? true,
      },
    };
    this.shared = options.shared || {
      tests: [],
      servers: [],
      defaultServer: null,
      taskManager: options.taskManager || new TaskManager(),
      platformBuiltinsRegistered: false,
      intelligence: {
        intents: [],
        learn: {},
      },
    };
    this.memoryRegistry = options.memoryRegistry || createMemoryRegistry({
      stdout: this.stdout,
      memoryMode: this.config.memoryMode,
      trackAllocations: this.config.trackAllocations,
      memoryWarnings: this.config.memoryWarnings,
      snapshotOnExit: this.config.snapshotOnExit,
      explainOwnership: this.config.explainOwnership,
    });
    this.globals = options.globals || createGlobalEnvironment({
      ...options,
      stdout: this.stdout,
      stderr: this.stderr,
      memoryRegistry: this.memoryRegistry,
      scopeName: options.scopeName || "global",
    });
    this.environment = options.environment || this.globals;
    this.moduleCache = options.moduleCache || new Map();
    this.cwd = options.cwd || process.cwd();
    this.filePath = options.filePath || null;
    this.sourceText = options.sourceText || null;
    this.functionDepth = options.functionDepth || 0;
    this.explicitExportNames = options.explicitExportNames || new Set();
    this.currentTask = options.currentTask || null;
    this.registerPlatformBuiltins();
  }

  fork(options = {}) {
    return new Interpreter({
      stdout: this.stdout,
      stderr: this.stderr,
      globals: this.globals,
      environment: options.environment || this.environment,
      moduleCache: this.moduleCache,
      cwd: options.cwd || this.cwd,
      filePath: options.filePath || this.filePath,
      sourceText: options.sourceText || this.sourceText,
      memoryRegistry: this.memoryRegistry,
      config: this.config,
      shared: this.shared,
      explicitExportNames: options.explicitExportNames || this.explicitExportNames,
      functionDepth: options.functionDepth ?? this.functionDepth,
      currentTask: options.currentTask ?? this.currentTask,
    });
  }

  registerPlatformBuiltins() {
    if (this.shared.platformBuiltinsRegistered) {
      return;
    }

    this.shared.platformBuiltinsRegistered = true;
    this.globals.define("http", createHttpRecord(this), { source: "stdlib" });
    this.globals.define("log", createLogger({ stdout: this.stdout, stderr: this.stderr }), { source: "stdlib" });
    this.globals.define("fs", createFsRecord(this), { source: "stdlib" });
    this.globals.define("system", createSystemRecord(this), { source: "stdlib" });
    this.globals.define("validate", createValidationRecord(), { source: "stdlib" });
    this.globals.define("sleep", new NativeFunction(
      "sleep",
      (_interpreter, args) => new MglFuture(new Promise((resolve) => {
        setTimeout(() => resolve(null), unwrapRuntimeValue(args[0]));
      }), { label: "sleep" }),
      { arity: 1 },
    ), { source: "stdlib" });
    this.globals.define("readDir", new NativeFunction(
      "readDir",
      (interpreter, args) => createSystemApi(interpreter).readDir(args[0]),
      { arity: 1 },
    ), { source: "stdlib" });
    this.globals.define("watchFile", new NativeFunction(
      "watchFile",
      (interpreter, args) => createSystemApi(interpreter).watch(args[0]),
      { arity: 1 },
    ), { source: "stdlib" });
    this.globals.define("exec", new NativeFunction(
      "exec",
      (interpreter, args) => createSystemApi(interpreter).exec(String(unwrapRuntimeValue(args[0]))),
      { arity: 1 },
    ), { source: "stdlib" });
    this.globals.define("json", new NativeFunction(
      "json",
      (_interpreter, args) => require("../runtime/http").jsonResponse(args[0], args[1] ? unwrapRuntimeValue(args[1]) : 200),
      { minArity: 1, maxArity: 2 },
    ), { source: "stdlib" });
    this.globals.define("serverRequest", new NativeFunction(
      "serverRequest",
      (interpreter, args) => new MglFuture(interpreter.directServerRequest(args), { label: "serverRequest" }),
      { minArity: 1, maxArity: 3 },
    ), { source: "stdlib" });
    this.globals.define("tasks", new NativeFunction(
      "tasks",
      (interpreter) => runtimeValueFromJs(
        interpreter.shared.taskManager.list().map((handle) => ({
          id: handle.id,
          name: handle.name,
          status: handle.status,
          cancelled: handle.cancelled,
        })),
        { anonymous: true },
      ),
      { arity: 0 },
    ), { source: "stdlib" });
    this.globals.define("taskStatus", new NativeFunction(
      "taskStatus",
      (_interpreter, args) => args[0] && args[0].status ? args[0].status : "unknown",
      { arity: 1 },
    ), { source: "stdlib" });
    this.globals.define("cancelTask", new NativeFunction(
      "cancelTask",
      (_interpreter, args) => (args[0] && typeof args[0].cancel === "function" ? args[0].cancel() : false),
      { arity: 1 },
    ), { source: "stdlib" });
    this.globals.define("waitTask", new NativeFunction(
      "waitTask",
      (_interpreter, args) => {
        const handle = args[0];
        if (!(handle instanceof MglTaskHandle)) {
          throw new MglRuntimeError("waitTask() expects a task handle.");
        }

        return new MglFuture(handle.promise, { label: `task:${handle.name}` });
      },
      { arity: 1 },
    ), { source: "stdlib" });
    this.globals.define("requireFields", new NativeFunction(
      "requireFields",
      (_interpreter, args) => requireFields(args[0], args[1]),
      { arity: 2 },
    ), { source: "stdlib" });
  }

  async interpret(program, context = {}) {
    return this.withExecutionContext(context, async () => {
      let lastValue = null;

      for (const statement of program.body) {
        lastValue = await this.execute(statement);
      }

      return lastValue;
    });
  }

  async execute(statement) {
    switch (statement.type) {
      case "BlockStatement":
        return this.executeBlock(
          statement.statements,
          new Environment(this.environment, {
            registry: this.memoryRegistry,
            scopeName: `block@${statement.statements.length}`,
            scopeKind: "block",
          }),
        );
      case "ExportDeclaration":
        return this.executeExportDeclaration(statement);
      case "ImportStatement":
        return this.executeImport(statement);
      case "IntentDeclaration":
        return this.executeIntentDeclaration(statement);
      case "LearnDeclaration":
        return this.executeLearnDeclaration(statement);
      case "TypeDeclaration":
        return this.executeTypeDeclaration(statement);
      case "VariableDeclaration":
        return this.executeVariableDeclaration(statement);
      case "FunctionDeclaration":
        return this.executeFunctionDeclaration(statement);
      case "ClassDeclaration":
        return this.executeClassDeclaration(statement);
      case "ServerDeclaration":
        return this.executeServerDeclaration(statement);
      case "TaskDeclaration":
        return this.executeTaskDeclaration(statement);
      case "TestDeclaration":
        return this.executeTestDeclaration(statement);
      case "IfStatement":
        if (this.isTruthy(await this.evaluate(statement.condition))) {
          return this.execute(statement.thenBranch);
        }

        if (statement.elseBranch) {
          return this.execute(statement.elseBranch);
        }

        return null;
      case "LoopStatement":
        return this.executeLoop(statement);
      case "LoopForeverStatement":
        return this.executeLoopForever(statement);
      case "ReturnStatement":
        if (this.functionDepth === 0) {
          throw new MglRuntimeError("Cannot return from top-level code.", {
            filePath: this.filePath,
            line: statement.keyword.line,
            column: statement.keyword.column,
          });
        }

        throw new ReturnSignal(statement.value ? await this.evaluate(statement.value) : null);
      case "MemoryCommandStatement":
        return this.executeMemoryCommand(statement);
      case "ExpressionStatement": {
        const result = await this.evaluate(statement.expression);
        return this.awaitIfFuture(result);
      }
      default:
        throw new Error(`Unknown statement type '${statement.type}'.`);
    }
  }

  async executeExportDeclaration(statement) {
    const result = await this.execute(statement.declaration);
    this.explicitExportNames.add(this.getDeclaredName(statement.declaration));
    return result;
  }

  async executeTypeDeclaration(statement) {
    const recordType = new MglRecordType(statement.name.lexeme, statement.fields);
    this.environment.define(statement.name.lexeme, recordType, {
      declaredType: namedType("type"),
      source: "user",
    });
    this.trackRuntimeValue(recordType, {
      reason: `type ${statement.name.lexeme}`,
      scopeName: this.environment.scopeName,
    });
    return null;
  }

  async executeIntentDeclaration(statement) {
    const metadata = await this.evaluateMetadataProperties(statement.properties);
    this.shared.intelligence.intents.push({
      filePath: this.filePath,
      values: metadata,
    });
    return runtimeValueFromJs(metadata, { anonymous: true });
  }

  async executeLearnDeclaration(statement) {
    const metadata = await this.evaluateMetadataProperties(statement.properties);
    this.shared.intelligence.learn = {
      ...this.shared.intelligence.learn,
      ...metadata,
    };
    return runtimeValueFromJs(metadata, { anonymous: true });
  }

  async executeVariableDeclaration(statement) {
    const value = this.enforceType(
      statement.initializer ? await this.evaluate(statement.initializer) : null,
      statement.typeAnnotation,
      statement.name,
      `Variable '${statement.name.lexeme}' expected ${this.describeType(statement.typeAnnotation)}.`,
    );

    this.environment.define(statement.name.lexeme, value, {
      declaredType: statement.typeAnnotation,
      source: "user",
    });
    return null;
  }

  async executeFunctionDeclaration(statement) {
    const func = new MglFunction(statement, this.environment, false);
    this.environment.define(statement.name.lexeme, func, { source: "user" });
    this.trackRuntimeValue(func, {
      reason: `${statement.isAsync ? "async " : ""}function ${statement.name.lexeme}`,
      scopeName: this.environment.scopeName,
    });
    return null;
  }

  async executeClassDeclaration(statement) {
    this.environment.define(statement.name.lexeme, null, { source: "user" });
    const methods = new Map();

    for (const method of statement.methods) {
      methods.set(
        method.name.lexeme,
        new MglFunction(method, this.environment, method.name.lexeme === "init"),
      );
    }

    const klass = new MglClass(statement.name.lexeme, methods);
    this.environment.assign(statement.name, klass, this.getErrorDetails(statement.name));
    this.trackRuntimeValue(klass, {
      reason: `class ${statement.name.lexeme}`,
      scopeName: this.environment.scopeName,
    });
    return null;
  }

  async executeServerDeclaration(statement) {
    const app = new MglServerApp(
      this,
      statement.routes.map((route) => new MglRoute(
        route.path.literal,
        route.method ? route.method.literal : "GET",
        route.body,
        this.environment,
      )),
      statement.middleware.map((layer) => new MglMiddleware(layer.body, this.environment)),
    );

    this.shared.servers.push(app);
    if (!this.shared.defaultServer) {
      this.shared.defaultServer = app;
    }

    this.environment.define(`server_${this.shared.servers.length}`, app, {
      declaredType: namedType("server"),
      source: "user",
    });
    this.trackRuntimeValue(app, {
      reason: "server app",
      scopeName: this.environment.scopeName,
    });
    return app;
  }

  async executeTaskDeclaration(statement) {
    const handle = this.shared.taskManager.startTask(statement.name.lexeme, async (taskHandle) => {
      const environment = new Environment(this.environment, {
        registry: this.memoryRegistry,
        scopeName: `task ${statement.name.lexeme}`,
        scopeKind: "task",
      });
      const taskInterpreter = this.fork({
        environment,
        functionDepth: 1,
        currentTask: taskHandle,
      });
      return taskInterpreter.executeSpecialBlock(statement.body, this.environment, {
        scopeName: `task ${statement.name.lexeme}`,
        currentTask: taskHandle,
      });
    });

    this.environment.define(statement.name.lexeme, handle, {
      declaredType: namedType("task"),
      source: "user",
    });
    this.trackRuntimeValue(handle, {
      reason: `task ${statement.name.lexeme}`,
      scopeName: this.environment.scopeName,
    });
    return handle;
  }

  async executeTestDeclaration(statement) {
    this.shared.tests.push({
      name: statement.name.literal,
      body: statement.body,
      closure: this.environment,
      filePath: this.filePath,
    });
    return null;
  }

  async executeImport(statement) {
    const moduleInfo = await this.loadModule(
      statement.source.literal,
      statement.source,
      statement.importKind || "mgl",
    );
    const bindingName = statement.alias ? statement.alias.lexeme : moduleInfo.name;

    this.environment.define(bindingName, moduleInfo.module, {
      declaredType: namedType("module"),
      source: "user",
    });
    this.trackRuntimeValue(moduleInfo.module, {
      reason: `import ${bindingName}`,
      scopeName: this.environment.scopeName,
    });
    return moduleInfo.module;
  }

  async executeLoop(statement) {
    const start = this.expectNumber(await this.evaluate(statement.start), statement.iterator, "Loop start must be numeric.");
    const end = this.expectNumber(await this.evaluate(statement.end), statement.iterator, "Loop end must be numeric.");
    const stepValue = statement.step
      ? this.expectNumber(await this.evaluate(statement.step), statement.iterator, "Loop step must be numeric.")
      : start <= end
        ? 1
        : -1;

    if (stepValue === 0) {
      throw new MglRuntimeError("Loop step cannot be zero.", {
        filePath: this.filePath,
        line: statement.iterator.line,
        column: statement.iterator.column,
      });
    }

    const predicate = stepValue > 0
      ? (value) => value <= end
      : (value) => value >= end;

    for (let current = start; predicate(current); current += stepValue) {
      if (this.currentTask && this.currentTask.cancelled) {
        break;
      }

      const loopScope = new Environment(this.environment, {
        registry: this.memoryRegistry,
        scopeName: `loop ${statement.iterator.lexeme}`,
        scopeKind: "loop",
      });
      loopScope.define(statement.iterator.lexeme, current, {
        declaredType: namedType("number"),
        source: "user",
      });
      await this.executeBlock(statement.body.statements, loopScope);
    }

    return null;
  }

  async executeLoopForever(statement) {
    while (true) {
      if (this.currentTask && this.currentTask.cancelled) {
        return null;
      }

      await this.executeBlock(
        statement.body.statements,
        new Environment(this.environment, {
          registry: this.memoryRegistry,
          scopeName: "loop",
          scopeKind: "loop",
        }),
      );
    }
  }

  async executeMemoryCommand(statement) {
    const value = await this.evaluate(statement.expression);

    switch (statement.command) {
      case "inspect":
      case "memory": {
        const details = inspectValue(this.memoryRegistry, value);
        this.stdout.write(`${stringifyValue(runtimeValueFromJs(details, { anonymous: true }))}\n`);
        return null;
      }
      case "whyalive":
        this.stdout.write(`${explainAllocation(this.memoryRegistry, value)}\n`);
        return null;
      case "optimize":
        this.stdout.write(`${stringifyValue(buildOptimizationHints(this.memoryRegistry, value))}\n`);
        return null;
      default:
        return null;
    }
  }

  async executeBlock(statements, environment, options = {}) {
    const previous = this.environment;
    this.environment = environment;

    try {
      let lastValue = null;
      for (const statement of statements) {
        lastValue = await this.execute(statement);
      }
      return lastValue;
    } catch (error) {
      if (options.allowReturn && error instanceof ReturnSignal) {
        return error.value;
      }

      throw error;
    } finally {
      this.environment = previous;
      if (environment !== this.globals) {
        environment.dispose();
      }
    }
  }

  async executeSpecialBlock(blockStatement, closure, options = {}) {
    const environment = new Environment(closure, {
      registry: this.memoryRegistry,
      scopeName: options.scopeName || "special-block",
      scopeKind: options.scopeKind || "function",
    });

    Object.entries(options.bindings || {}).forEach(([name, value]) => {
      environment.define(name, value, {
        source: "user",
      });
    });

    const child = this.fork({
      environment,
      functionDepth: options.allowReturn ? Math.max(this.functionDepth, 1) : this.functionDepth,
      currentTask: options.currentTask ?? this.currentTask,
    });

    return child.executeBlock(blockStatement.statements, environment, {
      allowReturn: options.allowReturn ?? false,
    });
  }

  async invokeFunction(func, args) {
    const environment = new Environment(func.closure, {
      registry: this.memoryRegistry,
      scopeName: `func ${func.declaration.name.lexeme}`,
      scopeKind: "function",
    });

    func.declaration.params.forEach((param, index) => {
      const argument = this.enforceType(
        args[index],
        param.typeAnnotation,
        param.name,
        `Parameter '${param.name.lexeme}' expected ${this.describeType(param.typeAnnotation)}.`,
      );

      environment.define(param.name.lexeme, argument, {
        declaredType: param.typeAnnotation,
        source: "user",
      });
    });

    const child = this.fork({
      environment,
      functionDepth: this.functionDepth + 1,
    });

    const result = await child.executeBlock(func.declaration.body.statements, environment, {
      allowReturn: true,
    });

    if (func.isInitializer) {
      return environment.get("self");
    }

    return this.enforceType(
      result === undefined ? null : result,
      func.declaration.returnType,
      func.declaration.name,
      `Function '${func.declaration.name.lexeme}' returned the wrong type.`,
    );
  }

  async invokeClass(klass, args) {
    const instance = new MglInstance(klass);
    const initializer = klass.findMethod("init");

    if (initializer) {
      const result = initializer.bind(instance).call(this, args);
      await resolveFuture(await result);
    }

    this.trackRuntimeValue(instance, {
      reason: `instance ${klass.name}`,
      explicit: false,
    });
    return instance;
  }

  async evaluate(expression) {
    switch (expression.type) {
      case "ArrayExpression":
        return this.trackRuntimeValue(await Promise.all(expression.elements.map((element) => this.evaluate(element))), {
          reason: "array literal",
          scopeName: this.environment.scopeName,
        });
      case "ObjectExpression":
        return this.evaluateObjectExpression(expression);
      case "TypeInitializerExpression":
        return this.evaluateTypeInitializer(expression);
      case "TrackExpression":
        return this.memoryRegistry.trackExplicitValue(await this.evaluate(expression.value), {
          filePath: this.filePath,
          scopeName: this.environment.scopeName,
          reason: "tracked via track expression",
        });
      case "AwaitExpression":
        return resolveFuture(await this.evaluate(expression.expression));
      case "Literal":
        return expression.value;
      case "GroupingExpression":
        return this.evaluate(expression.expression);
      case "Identifier":
        return this.environment.get(expression.name, this.getErrorDetails(expression.name));
      case "UnaryExpression":
        return this.evaluateUnary(expression);
      case "BinaryExpression":
        return this.evaluateBinary(expression);
      case "LogicalExpression":
        return this.evaluateLogical(expression);
      case "AssignmentExpression":
        return this.evaluateAssignment(expression);
      case "CallExpression":
        return this.evaluateCall(expression);
      case "GetExpression":
        return this.evaluateGet(expression);
      case "IndexExpression":
        return this.evaluateIndex(expression);
      default:
        throw new Error(`Unknown expression type '${expression.type}'.`);
    }
  }

  async evaluateObjectExpression(expression) {
    const record = new MglRecordInstance("object", { anonymous: true });

    for (const property of expression.properties) {
      record.fields.set(property.key.lexeme, await this.evaluate(property.value));
    }

    this.trackRuntimeValue(record, {
      reason: "object literal",
      scopeName: this.environment.scopeName,
    });
    this.memoryRegistry.syncRelationships(record);
    return record;
  }

  async evaluateMetadataProperties(properties) {
    const metadata = {};

    for (const property of properties) {
      metadata[property.key.lexeme] = runtimeValueToPlain(await this.evaluate(property.value));
    }

    return metadata;
  }

  async evaluateTypeInitializer(expression) {
    const typeValue = this.environment.get(expression.typeName, this.getErrorDetails(expression.typeName));
    if (!(typeValue instanceof MglRecordType)) {
      throw new MglRuntimeError(`'${expression.typeName.lexeme}' is not a record type.`, this.getErrorDetails(expression.typeName));
    }

    const record = new MglRecordInstance(typeValue.name, {
      anonymous: false,
      schema: typeValue.fields,
    });
    const provided = new Set();

    for (const property of expression.fields) {
      const field = typeValue.getField(property.key.lexeme);
      if (!field) {
        throw new MglRuntimeError(
          `Type '${typeValue.name}' has no field named '${property.key.lexeme}'.`,
          this.getErrorDetails(property.key),
        );
      }

      const value = this.enforceType(
        await this.evaluate(property.value),
        field.typeAnnotation,
        property.key,
        `Field '${property.key.lexeme}' expected ${this.describeType(field.typeAnnotation)}.`,
      );

      record.fields.set(property.key.lexeme, value);
      provided.add(property.key.lexeme);
    }

    typeValue.fields.forEach((field, fieldName) => {
      if (provided.has(fieldName)) {
        return;
      }

      record.fields.set(fieldName, this.enforceType(
        null,
        field.typeAnnotation,
        field.name,
        `Field '${fieldName}' expected ${this.describeType(field.typeAnnotation)}.`,
      ));
    });

    this.trackRuntimeValue(record, {
      reason: `type initializer ${typeValue.name}`,
      scopeName: this.environment.scopeName,
    });
    this.memoryRegistry.syncRelationships(record);
    return record;
  }

  async evaluateUnary(expression) {
    const right = unwrapRuntimeValue(await this.evaluate(expression.right));

    switch (expression.operator.type) {
      case TokenType.BANG:
        return !this.isTruthy(right);
      case TokenType.MINUS:
        return -this.expectNumber(right, expression.operator, "Unary '-' expects a number.");
      default:
        throw new Error(`Unknown unary operator '${expression.operator.type}'.`);
    }
  }

  async evaluateBinary(expression) {
    const left = unwrapRuntimeValue(await this.evaluate(expression.left));
    const right = unwrapRuntimeValue(await this.evaluate(expression.right));

    switch (expression.operator.type) {
      case TokenType.PLUS:
        if (typeof left === "number" && typeof right === "number") {
          return left + right;
        }

        return stringifyValue(left) + stringifyValue(right);
      case TokenType.MINUS:
        return this.expectNumber(left, expression.operator, "Left operand of '-' must be numeric.")
          - this.expectNumber(right, expression.operator, "Right operand of '-' must be numeric.");
      case TokenType.STAR:
        return this.expectNumber(left, expression.operator, "Left operand of '*' must be numeric.")
          * this.expectNumber(right, expression.operator, "Right operand of '*' must be numeric.");
      case TokenType.SLASH: {
        const divisor = this.expectNumber(right, expression.operator, "Right operand of '/' must be numeric.");
        if (divisor === 0) {
          throw new MglRuntimeError("Division by zero.", {
            filePath: this.filePath,
            line: expression.operator.line,
            column: expression.operator.column,
          });
        }

        return this.expectNumber(left, expression.operator, "Left operand of '/' must be numeric.") / divisor;
      }
      case TokenType.PERCENT: {
        const divisor = this.expectNumber(right, expression.operator, "Right operand of '%' must be numeric.");
        if (divisor === 0) {
          throw new MglRuntimeError("Modulo by zero.", {
            filePath: this.filePath,
            line: expression.operator.line,
            column: expression.operator.column,
          });
        }

        return this.expectNumber(left, expression.operator, "Left operand of '%' must be numeric.") % divisor;
      }
      case TokenType.GREATER:
        return this.compareValues(left, right, expression.operator, (a, b) => a > b);
      case TokenType.GREATER_EQUAL:
        return this.compareValues(left, right, expression.operator, (a, b) => a >= b);
      case TokenType.LESS:
        return this.compareValues(left, right, expression.operator, (a, b) => a < b);
      case TokenType.LESS_EQUAL:
        return this.compareValues(left, right, expression.operator, (a, b) => a <= b);
      case TokenType.EQUAL_EQUAL:
        return Object.is(left, right);
      case TokenType.BANG_EQUAL:
        return !Object.is(left, right);
      default:
        throw new Error(`Unknown binary operator '${expression.operator.type}'.`);
    }
  }

  async evaluateLogical(expression) {
    const left = await this.evaluate(expression.left);

    if (expression.operator.type === TokenType.OR) {
      return this.isTruthy(left) ? left : this.evaluate(expression.right);
    }

    return !this.isTruthy(left) ? left : this.evaluate(expression.right);
  }

  async evaluateAssignment(expression) {
    const value = await this.evaluate(expression.value);

    if (expression.target.type === "Identifier") {
      const binding = this.environment.getBinding(expression.target.name, this.getErrorDetails(expression.target.name));
      const typedValue = this.enforceType(
        value,
        binding.declaredType,
        expression.target.name,
        `Variable '${expression.target.name.lexeme}' expected ${this.describeType(binding.declaredType)}.`,
      );

      this.environment.assign(expression.target.name, typedValue, this.getErrorDetails(expression.target.name));
      return typedValue;
    }

    if (expression.target.type === "IndexExpression") {
      return this.assignIndex(expression.target, value);
    }

    if (expression.target.type === "GetExpression") {
      const object = await this.evaluate(expression.target.object);
      if (object instanceof MglModule) {
        throw new MglRuntimeError("Module namespaces are read-only.", this.getErrorDetails(expression.operator));
      }

      if (!(object instanceof MglInstance || object instanceof MglRecordInstance)) {
        throw new MglRuntimeError("Only objects can receive property assignments.", {
          ...this.getErrorDetails(expression.operator),
        });
      }

      object.set(expression.target.name, value);
      this.memoryRegistry.markMutation(object, `field '${expression.target.name.lexeme}' updated`);
      return value;
    }

    throw new Error("Unsupported assignment target.");
  }

  async evaluateCall(expression) {
    const callee = await this.evaluate(expression.callee);
    const rawCallee = unwrapRuntimeValue(callee);
    const args = [];

    for (const arg of expression.args) {
      args.push(await this.evaluate(arg));
    }

    if (!isCallable(rawCallee)) {
      throw new MglRuntimeError("Only functions and classes can be called.", {
        filePath: this.filePath,
        line: expression.paren.line,
        column: expression.paren.column,
      });
    }

    if (!rawCallee.acceptsArgs(args.length)) {
      throw new MglRuntimeError(
        `Expected ${rawCallee.arityDescription()} argument(s) but received ${args.length}.`,
        {
          filePath: this.filePath,
          line: expression.paren.line,
          column: expression.paren.column,
        },
      );
    }

    const result = rawCallee.call(this, args);

    if (isFuture(result)) {
      return result;
    }

    return result instanceof Promise ? await result : result;
  }

  async evaluateGet(expression) {
    const object = await this.evaluate(expression.object);
    if (object instanceof MglModule) {
      return object.get(expression.name, this.getErrorDetails(expression.name));
    }

    if (!(object instanceof MglInstance || object instanceof MglRecordInstance)) {
      throw new MglRuntimeError("Only objects have properties.", {
        ...this.getErrorDetails(expression.name),
      });
    }

    return object.get(expression.name, this.filePath);
  }

  async evaluateIndex(expression) {
    const object = unwrapRuntimeValue(await this.evaluate(expression.object));
    const index = this.expectNumber(
      unwrapRuntimeValue(await this.evaluate(expression.index)),
      expression.bracket,
      "Index expressions require a numeric index.",
    );
    const normalizedIndex = Math.trunc(index);

    if (Array.isArray(object) || typeof object === "string") {
      if (normalizedIndex < 0 || normalizedIndex >= object.length) {
        throw new MglRuntimeError("Index out of bounds.", this.getErrorDetails(expression.bracket));
      }

      return object[normalizedIndex];
    }

    throw new MglRuntimeError("Only arrays and strings support index access.", this.getErrorDetails(expression.bracket));
  }

  compareValues(left, right, operator, comparator) {
    const sameTypes = typeof left === typeof right;
    const validType = typeof left === "number" || typeof left === "string";

    if (!sameTypes || !validType) {
      throw new MglRuntimeError("Comparison operators require two numbers or two strings.", {
        ...this.getErrorDetails(operator),
      });
    }

    return comparator(left, right);
  }

  expectNumber(value, token, message) {
    const rawValue = unwrapRuntimeValue(value);
    if (typeof rawValue !== "number" || Number.isNaN(rawValue)) {
      throw new MglRuntimeError(message, {
        ...this.getErrorDetails(token),
      });
    }

    return rawValue;
  }

  enforceType(value, typeAnnotation, token, message) {
    const normalizedType = normalizeTypeAnnotation(typeAnnotation);

    if (!normalizedType) {
      return value;
    }

    if (!matchesType(value, normalizedType, {
      resolveType: (name) => this.resolveRuntimeType(name),
    })) {
      throw new MglRuntimeError(
        `${message} Received ${describeRuntimeType(value)}.`,
        this.getErrorDetails(this.getTypeToken(normalizedType, token)),
      );
    }

    return tagValueWithType(value, normalizedType);
  }

  describeType(typeAnnotation) {
    return stringifyType(typeAnnotation);
  }

  resolveRuntimeType(name) {
    try {
      const value = this.environment.get(name);
      return value instanceof MglClass || value instanceof MglRecordType ? value : null;
    } catch (_error) {
      return null;
    }
  }

  getTypeToken(typeAnnotation, fallbackToken = null) {
    if (!typeAnnotation) {
      return fallbackToken;
    }

    if (typeAnnotation.type === "ArrayType") {
      return typeAnnotation.keyword || fallbackToken;
    }

    return typeAnnotation.name || fallbackToken;
  }

  async withExecutionContext(context, callback) {
    const previous = {
      cwd: this.cwd,
      filePath: this.filePath,
      sourceText: this.sourceText,
    };

    this.cwd = context.cwd || this.cwd;
    this.filePath = context.filePath || this.filePath;
    this.sourceText = context.sourceText || this.sourceText;

    try {
      return await callback();
    } finally {
      this.cwd = previous.cwd;
      this.filePath = previous.filePath;
      this.sourceText = previous.sourceText;
    }
  }

  async loadModule(specifier, token, importKind = "mgl") {
    const modulePath = this.resolveModulePath(specifier, token, importKind);
    const moduleName = this.deriveModuleName(modulePath);
    const cacheKey = `${importKind}:${modulePath}`;

    if (this.moduleCache.has(cacheKey)) {
      return {
        name: moduleName,
        module: this.moduleCache.get(cacheKey),
      };
    }

    if (importKind === "rust") {
      const rustModuleInfo = loadRustModule(this, modulePath, {
        projectRoot: this.cwd,
      });
      this.moduleCache.set(cacheKey, rustModuleInfo.module);
      this.trackRuntimeValue(rustModuleInfo.module, {
        reason: `rust module ${moduleName}`,
        scopeName: `rust module ${moduleName}`,
      });
      this.memoryRegistry.syncRelationships(rustModuleInfo.module);

      return {
        name: moduleName,
        module: rustModuleInfo.module,
      };
    }

    let source;
    try {
      source = fs.readFileSync(modulePath, "utf8");
    } catch (error) {
      throw new MglRuntimeError(`Unable to read module '${specifier}': ${error.message}`, this.getErrorDetails(token));
    }

    const module = new MglModule(moduleName, modulePath);
    this.moduleCache.set(cacheKey, module);
    this.trackRuntimeValue(module, {
      reason: `module ${moduleName}`,
      scopeName: `module ${moduleName}`,
    });

    const lexer = new Lexer(source, { filePath: modulePath });
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, { filePath: modulePath, sourceText: source });
    const program = parser.parse();
    const moduleEnvironment = new Environment(this.globals, {
      registry: this.memoryRegistry,
      scopeName: `module ${moduleName}`,
      scopeKind: "module",
    });
    const moduleInterpreter = this.fork({
      environment: moduleEnvironment,
      cwd: path.dirname(modulePath),
      filePath: modulePath,
      sourceText: source,
      explicitExportNames: new Set(),
    });

    await moduleInterpreter.interpret(program, {
      cwd: path.dirname(modulePath),
      filePath: modulePath,
      sourceText: source,
    });

    const exportsMap = moduleInterpreter.explicitExportNames.size > 0
      ? filterExports(moduleEnvironment.snapshot(), moduleInterpreter.explicitExportNames)
      : moduleEnvironment.snapshot();
    module.setExports(exportsMap);
    this.memoryRegistry.syncRelationships(module);

    return {
      name: moduleName,
      module,
    };
  }

  resolveModulePath(specifier, token, importKind = "mgl") {
    const baseDirectory = this.filePath && path.isAbsolute(this.filePath)
      ? path.dirname(this.filePath)
      : this.cwd;
    const requestedPath = path.isAbsolute(specifier)
      ? specifier
      : path.resolve(baseDirectory, specifier);
    const normalizedPath = path.extname(requestedPath)
      ? requestedPath
      : `${requestedPath}.${importKind === "rust" ? "rs" : "mgl"}`;

    if (!fs.existsSync(normalizedPath)) {
      throw new MglRuntimeError(`Cannot find module '${specifier}'.`, this.getErrorDetails(token));
    }

    return normalizedPath;
  }

  deriveModuleName(modulePath) {
    return path.basename(modulePath, path.extname(modulePath)).replace(/[^A-Za-z0-9_]/g, "_");
  }

  getErrorDetails(token, overrides = {}) {
    return {
      filePath: overrides.filePath || (token && token.filePath) || this.filePath,
      line: overrides.line || (token ? token.line : null),
      column: overrides.column || (token ? token.column : null),
      sourceText: overrides.sourceText || this.sourceText || null,
    };
  }

  async assignIndex(target, value) {
    const object = unwrapRuntimeValue(await this.evaluate(target.object));
    const index = this.expectNumber(
      unwrapRuntimeValue(await this.evaluate(target.index)),
      target.bracket,
      "Index assignments require a numeric index.",
    );
    const normalizedIndex = Math.trunc(index);

    if (!Array.isArray(object)) {
      throw new MglRuntimeError("Only arrays support index assignment.", this.getErrorDetails(target.bracket));
    }

    if (normalizedIndex < 0 || normalizedIndex >= object.length) {
      throw new MglRuntimeError("Index out of bounds.", this.getErrorDetails(target.bracket));
    }

    const taggedType = getTaggedType(object);
    const elementType = taggedType && taggedType.type === "ArrayType" ? taggedType.elementType : null;
    const typedValue = elementType
      ? this.enforceType(
        value,
        elementType,
        target.bracket,
        `Array element expected ${this.describeType(elementType)}.`,
      )
      : value;

    object[normalizedIndex] = typedValue;
    this.memoryRegistry.markMutation(object, `index ${normalizedIndex} updated`);
    return typedValue;
  }

  trackRuntimeValue(value, meta = {}) {
    return this.memoryRegistry.trackValue(value, {
      filePath: this.filePath,
      scopeName: meta.scopeName || this.environment.scopeName,
      reason: meta.reason || "runtime value",
      explicit: meta.explicit || false,
    });
  }

  getDeclaredName(declaration) {
    switch (declaration.type) {
      case "VariableDeclaration":
      case "FunctionDeclaration":
      case "ClassDeclaration":
      case "TypeDeclaration":
      case "TaskDeclaration":
      case "TestDeclaration":
        return declaration.name.lexeme || declaration.name.literal;
      default:
        throw new Error(`Cannot export declaration type '${declaration.type}'.`);
    }
  }

  isTruthy(value) {
    const rawValue = unwrapRuntimeValue(value);
    return !(rawValue === null || rawValue === false);
  }

  async awaitIfFuture(value) {
    if (isFuture(value)) {
      return resolveFuture(value);
    }

    return value;
  }

  async directServerRequest(args) {
    const [pathValue, methodValue, bodyValue] = args;
    const app = this.shared.defaultServer;

    if (!app) {
      throw new MglRuntimeError("No server declaration is available for direct requests.");
    }

    return app.handle({
      method: methodValue ? String(unwrapRuntimeValue(methodValue)).toUpperCase() : "GET",
      path: String(unwrapRuntimeValue(pathValue)),
      headers: {},
      query: {},
      body: bodyValue === undefined || bodyValue === null ? "" : requestBodyFromValue(bodyValue),
    }).then((response) => runtimeValueFromJs({
      status: response.status,
      body: response.body,
      headers: response.headers,
      json: safeJson(response.body),
    }, { anonymous: true }));
  }

  async runRegisteredTests(options = {}) {
    const results = [];

    for (const testCase of this.shared.tests) {
      try {
        await this.executeSpecialBlock(testCase.body, testCase.closure, {
          scopeName: `test ${testCase.name}`,
          allowReturn: true,
        });
        results.push({ name: testCase.name, status: "passed" });
      } catch (error) {
        results.push({ name: testCase.name, status: "failed", error });
      }
    }

    return results;
  }
}

function createHttpRecord(interpreter) {
  const client = createHttpClient(interpreter);
  return runtimeValueFromJs({
    get: new NativeFunction("http.get", (_interpreter, args) => client.get(
      String(unwrapRuntimeValue(args[0])),
      args[1] || {},
    ), {
      minArity: 1,
      maxArity: 2,
    }),
    post: new NativeFunction("http.post", (_interpreter, args) => client.post(
      String(unwrapRuntimeValue(args[0])),
      args[1],
      args[2] || {},
    ), {
      minArity: 2,
      maxArity: 3,
    }),
    request: new NativeFunction("http.request", (_interpreter, args) => client.request(
      String(unwrapRuntimeValue(args[0])),
      String(unwrapRuntimeValue(args[1])),
      args[2] || {},
    ), {
      arity: 3,
    }),
  }, { anonymous: true });
}

function createFsRecord(interpreter) {
  const api = createSystemApi(interpreter);
  return runtimeValueFromJs({
    readDir: new NativeFunction("fs.readDir", (_interpreter, args) => api.readDir(String(unwrapRuntimeValue(args[0]))), {
      arity: 1,
    }),
    watch: new NativeFunction("fs.watch", (_interpreter, args) => api.watch(String(unwrapRuntimeValue(args[0]))), {
      arity: 1,
    }),
    exec: new NativeFunction("fs.exec", (_interpreter, args) => api.exec(String(unwrapRuntimeValue(args[0]))), {
      arity: 1,
    }),
  }, { anonymous: true });
}

function createSystemRecord(interpreter) {
  const api = createSystemApi(interpreter);
  return runtimeValueFromJs({
    os: new NativeFunction("system.os", () => api.os(), { arity: 0 }),
    arch: new NativeFunction("system.arch", () => api.arch(), { arity: 0 }),
    cwd: new NativeFunction("system.cwd", () => api.cwd(), { arity: 0 }),
    home: new NativeFunction("system.home", () => api.home(), { arity: 0 }),
    pid: new NativeFunction("system.pid", () => api.pid(), { arity: 0 }),
    env: new NativeFunction("system.env", (_interpreter, args) => api.env(args[0]), {
      minArity: 0,
      maxArity: 1,
    }),
    exec: new NativeFunction("system.exec", (_interpreter, args) => api.exec(args[0], args[1] || {}), {
      minArity: 1,
      maxArity: 2,
    }),
    spawn: new NativeFunction("system.spawn", (_interpreter, args) => api.spawn(args[0], args[1] || [], args[2] || {}), {
      minArity: 1,
      maxArity: 3,
    }),
    readDir: new NativeFunction("system.readDir", (_interpreter, args) => api.readDir(args[0]), { arity: 1 }),
    watch: new NativeFunction("system.watch", (_interpreter, args) => api.watch(args[0]), { arity: 1 }),
  }, { anonymous: true });
}

function createValidationRecord() {
  return runtimeValueFromJs({
    required: new NativeFunction("validate.required", (_interpreter, args) => {
      const [value, label] = args;
      if (value === null || value === undefined || unwrapRuntimeValue(value) === "") {
        throw new MglRuntimeError(`${label ? stringifyValue(label) : "value"} is required.`);
      }
      return true;
    }, { minArity: 1, maxArity: 2 }),
    string: new NativeFunction("validate.string", (_interpreter, args) => {
      if (typeof unwrapRuntimeValue(args[0]) !== "string") {
        throw new MglRuntimeError(`${args[1] ? stringifyValue(args[1]) : "value"} must be a string.`);
      }
      return true;
    }, { minArity: 1, maxArity: 2 }),
    number: new NativeFunction("validate.number", (_interpreter, args) => {
      const value = unwrapRuntimeValue(args[0]);
      if (typeof value !== "number" || Number.isNaN(value)) {
        throw new MglRuntimeError(`${args[1] ? stringifyValue(args[1]) : "value"} must be a number.`);
      }
      return true;
    }, { minArity: 1, maxArity: 2 }),
    bool: new NativeFunction("validate.bool", (_interpreter, args) => {
      if (typeof unwrapRuntimeValue(args[0]) !== "boolean") {
        throw new MglRuntimeError(`${args[1] ? stringifyValue(args[1]) : "value"} must be a bool.`);
      }
      return true;
    }, { minArity: 1, maxArity: 2 }),
  }, { anonymous: true });
}

function filterExports(snapshot, explicitExportNames) {
  const filtered = new Map();

  for (const exportName of explicitExportNames) {
    if (snapshot.has(exportName)) {
      filtered.set(exportName, snapshot.get(exportName));
    }
  }

  return filtered;
}

function requireFields(value, fields) {
  const missing = [];
  const target = value && value.fields instanceof Map
    ? Object.fromEntries(Array.from(value.fields.entries()))
    : value;
  const required = Array.isArray(fields)
    ? fields.map((field) => String(unwrapRuntimeValue(field)))
    : [];

  for (const fieldName of required) {
    if (!(fieldName in target)) {
      missing.push(fieldName);
    }
  }

  if (missing.length > 0) {
    throw new MglRuntimeError(`Missing required field(s): ${missing.join(", ")}.`);
  }

  return true;
}

function safeJson(body) {
  if (typeof body !== "string") {
    return null;
  }

  try {
    return JSON.parse(body);
  } catch (_error) {
    return null;
  }
}

function requestBodyFromValue(bodyValue) {
  const rawValue = unwrapRuntimeValue(bodyValue);

  if (typeof rawValue === "string") {
    return rawValue;
  }

  if (rawValue === null || rawValue === undefined) {
    return "";
  }

  if (Array.isArray(rawValue) || (rawValue && typeof rawValue === "object")) {
    return JSON.stringify(require("../runtime/http").serializeJsonValue(rawValue));
  }

  return stringifyValue(rawValue);
}

function runtimeValueToPlain(value) {
  const rawValue = unwrapRuntimeValue(value);

  if (rawValue === null || rawValue === undefined) {
    return null;
  }

  if (Array.isArray(rawValue)) {
    return rawValue.map((item) => runtimeValueToPlain(item));
  }

  if (rawValue && rawValue.fields instanceof Map) {
    const object = {};
    rawValue.fields.forEach((fieldValue, fieldName) => {
      object[fieldName] = runtimeValueToPlain(fieldValue);
    });
    return object;
  }

  if (rawValue && typeof rawValue === "object") {
    return String(rawValue);
  }

  return rawValue;
}

module.exports = {
  Interpreter,
};
