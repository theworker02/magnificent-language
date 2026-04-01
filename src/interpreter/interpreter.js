const fs = require("fs");
const path = require("path");

const { Environment } = require("../runtime/environment");
const { createGlobalEnvironment } = require("../runtime/stdlib");
const { Lexer } = require("../lexer/lexer");
const { Parser } = require("../parser/parser");
const {
  MglClass,
  MglFunction,
  MglInstance,
  MglModule,
  ReturnSignal,
  isCallable,
  stringifyValue,
} = require("../runtime/values");
const { TokenType } = require("../lexer/token");
const { MglRuntimeError } = require("../utils/errors");

class Interpreter {
  constructor(options = {}) {
    this.stdout = options.stdout || process.stdout;
    this.stderr = options.stderr || process.stderr;
    this.globals = options.globals || createGlobalEnvironment(options);
    this.environment = options.environment || this.globals;
    this.moduleCache = options.moduleCache || new Map();
    this.cwd = options.cwd || process.cwd();
    this.filePath = options.filePath || null;
    this.sourceText = options.sourceText || null;
    this.functionDepth = 0;
  }

  interpret(program, context = {}) {
    return this.withExecutionContext(context, () => {
      let lastValue = null;

      for (const statement of program.body) {
        lastValue = this.execute(statement);
      }

      return lastValue;
    });
  }

  execute(statement) {
    switch (statement.type) {
      case "BlockStatement":
        return this.executeBlock(statement.statements, new Environment(this.environment));
      case "ImportStatement":
        return this.executeImport(statement);
      case "VariableDeclaration":
        this.environment.define(
          statement.name.lexeme,
          statement.initializer ? this.evaluate(statement.initializer) : null,
        );
        return null;
      case "FunctionDeclaration":
        this.environment.define(
          statement.name.lexeme,
          new MglFunction(statement, this.environment, false),
        );
        return null;
      case "ClassDeclaration":
        return this.executeClassDeclaration(statement);
      case "IfStatement":
        if (this.isTruthy(this.evaluate(statement.condition))) {
          return this.execute(statement.thenBranch);
        } else if (statement.elseBranch) {
          return this.execute(statement.elseBranch);
        }
        return null;
      case "LoopStatement":
        return this.executeLoop(statement);
      case "ReturnStatement":
        if (this.functionDepth === 0) {
          throw new MglRuntimeError("Cannot return from top-level code.", {
            filePath: this.filePath,
            line: statement.keyword.line,
            column: statement.keyword.column,
          });
        }

        throw new ReturnSignal(statement.value ? this.evaluate(statement.value) : null);
      case "ExpressionStatement":
        return this.evaluate(statement.expression);
      default:
        throw new Error(`Unknown statement type '${statement.type}'.`);
    }
  }

  executeClassDeclaration(statement) {
    this.environment.define(statement.name.lexeme, null);
    const methods = new Map();

    for (const method of statement.methods) {
      methods.set(
        method.name.lexeme,
        new MglFunction(method, this.environment, method.name.lexeme === "init"),
      );
    }

    const klass = new MglClass(statement.name.lexeme, methods);
    this.environment.assign(statement.name, klass);
    return null;
  }

  executeImport(statement) {
    const moduleInfo = this.loadModule(statement.source.literal, statement.source);
    this.environment.define(moduleInfo.name, moduleInfo.module);
    return moduleInfo.module;
  }

  executeLoop(statement) {
    const start = this.expectNumber(this.evaluate(statement.start), statement.iterator, "Loop start must be numeric.");
    const end = this.expectNumber(this.evaluate(statement.end), statement.iterator, "Loop end must be numeric.");
    const stepValue = statement.step
      ? this.expectNumber(this.evaluate(statement.step), statement.iterator, "Loop step must be numeric.")
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
      const loopScope = new Environment(this.environment);
      loopScope.define(statement.iterator.lexeme, current);
      this.executeBlock(statement.body.statements, loopScope);
    }

    return null;
  }

  executeBlock(statements, environment) {
    const previous = this.environment;
    this.environment = environment;

    try {
      let lastValue = null;
      for (const statement of statements) {
        lastValue = this.execute(statement);
      }
      return lastValue;
    } finally {
      this.environment = previous;
    }
  }

  evaluate(expression) {
    switch (expression.type) {
      case "ArrayExpression":
        return expression.elements.map((element) => this.evaluate(element));
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

  evaluateUnary(expression) {
    const right = this.evaluate(expression.right);

    switch (expression.operator.type) {
      case TokenType.BANG:
        return !this.isTruthy(right);
      case TokenType.MINUS:
        return -this.expectNumber(right, expression.operator, "Unary '-' expects a number.");
      default:
        throw new Error(`Unknown unary operator '${expression.operator.type}'.`);
    }
  }

  evaluateBinary(expression) {
    const left = this.evaluate(expression.left);
    const right = this.evaluate(expression.right);

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

  evaluateLogical(expression) {
    const left = this.evaluate(expression.left);

    if (expression.operator.type === TokenType.OR) {
      return this.isTruthy(left) ? left : this.evaluate(expression.right);
    }

    return !this.isTruthy(left) ? left : this.evaluate(expression.right);
  }

  evaluateAssignment(expression) {
    const value = this.evaluate(expression.value);

    if (expression.target.type === "Identifier") {
      this.environment.assign(expression.target.name, value, this.getErrorDetails(expression.target.name));
      return value;
    }

    if (expression.target.type === "IndexExpression") {
      return this.assignIndex(expression.target, value);
    }

    if (expression.target.type === "GetExpression") {
      const object = this.evaluate(expression.target.object);
      if (object instanceof MglModule) {
        throw new MglRuntimeError("Module namespaces are read-only.", this.getErrorDetails(expression.operator));
      }

      if (!(object instanceof MglInstance)) {
        throw new MglRuntimeError("Only instances can receive property assignments.", {
          ...this.getErrorDetails(expression.operator),
        });
      }

      object.set(expression.target.name, value);
      return value;
    }

    throw new Error("Unsupported assignment target.");
  }

  evaluateCall(expression) {
    const callee = this.evaluate(expression.callee);
    const args = expression.args.map((arg) => this.evaluate(arg));

    if (!isCallable(callee)) {
      throw new MglRuntimeError("Only functions and classes can be called.", {
        filePath: this.filePath,
        line: expression.paren.line,
        column: expression.paren.column,
      });
    }

    if (!callee.acceptsArgs(args.length)) {
      throw new MglRuntimeError(
        `Expected ${callee.arityDescription()} argument(s) but received ${args.length}.`,
        {
          filePath: this.filePath,
          line: expression.paren.line,
          column: expression.paren.column,
        },
      );
    }

    return callee.call(this, args);
  }

  evaluateGet(expression) {
    const object = this.evaluate(expression.object);
    if (object instanceof MglModule) {
      return object.get(expression.name, this.getErrorDetails(expression.name));
    }

    if (!(object instanceof MglInstance)) {
      throw new MglRuntimeError("Only instances have properties.", {
        ...this.getErrorDetails(expression.name),
      });
    }

    return object.get(expression.name, this.filePath);
  }

  evaluateIndex(expression) {
    const object = this.evaluate(expression.object);
    const index = this.expectNumber(
      this.evaluate(expression.index),
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
    if (typeof value !== "number" || Number.isNaN(value)) {
      throw new MglRuntimeError(message, {
        ...this.getErrorDetails(token),
      });
    }

    return value;
  }

  withExecutionContext(context, callback) {
    const previous = {
      cwd: this.cwd,
      filePath: this.filePath,
      sourceText: this.sourceText,
    };

    this.cwd = context.cwd || this.cwd;
    this.filePath = context.filePath || this.filePath;
    this.sourceText = context.sourceText || this.sourceText;

    try {
      return callback();
    } finally {
      this.cwd = previous.cwd;
      this.filePath = previous.filePath;
      this.sourceText = previous.sourceText;
    }
  }

  loadModule(specifier, token) {
    const modulePath = this.resolveModulePath(specifier, token);
    const moduleName = this.deriveModuleName(modulePath);

    if (this.moduleCache.has(modulePath)) {
      return {
        name: moduleName,
        module: this.moduleCache.get(modulePath),
      };
    }

    let source;
    try {
      source = fs.readFileSync(modulePath, "utf8");
    } catch (error) {
      throw new MglRuntimeError(`Unable to read module '${specifier}': ${error.message}`, this.getErrorDetails(token));
    }

    const module = new MglModule(moduleName, modulePath);
    this.moduleCache.set(modulePath, module);

    const lexer = new Lexer(source, { filePath: modulePath });
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, { filePath: modulePath, sourceText: source });
    const program = parser.parse();
    const moduleEnvironment = new Environment(this.globals);
    const moduleInterpreter = new Interpreter({
      stdout: this.stdout,
      stderr: this.stderr,
      globals: this.globals,
      environment: moduleEnvironment,
      moduleCache: this.moduleCache,
      cwd: path.dirname(modulePath),
      filePath: modulePath,
      sourceText: source,
    });

    moduleInterpreter.interpret(program, {
      cwd: path.dirname(modulePath),
      filePath: modulePath,
      sourceText: source,
    });
    module.setExports(moduleEnvironment.snapshot());

    return {
      name: moduleName,
      module,
    };
  }

  resolveModulePath(specifier, token) {
    const baseDirectory = this.filePath && path.isAbsolute(this.filePath)
      ? path.dirname(this.filePath)
      : this.cwd;
    const requestedPath = path.isAbsolute(specifier)
      ? specifier
      : path.resolve(baseDirectory, specifier);
    const normalizedPath = path.extname(requestedPath) ? requestedPath : `${requestedPath}.mgl`;

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

  assignIndex(target, value) {
    const object = this.evaluate(target.object);
    const index = this.expectNumber(
      this.evaluate(target.index),
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

    object[normalizedIndex] = value;
    return value;
  }

  isTruthy(value) {
    return !(value === null || value === false);
  }
}

module.exports = {
  Interpreter,
};
