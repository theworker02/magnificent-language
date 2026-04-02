const path = require("path");

const { resolveImportPath } = require("../tooling/inspector");
const {
  PredictiveScope,
  PredictiveState,
  cloneValue,
  inferValueType,
  isArrayValue,
  isObjectValue,
  isTrackedValue,
  isTruthy,
  isUnknown,
  makeArray,
  makeFuture,
  makeNative,
  makeObject,
  makeTrackedScalar,
  makeUnknown,
  makeVector3,
  stringifyPredictiveValue,
  unwrapValue,
} = require("./state-tracker");
const { capStates } = require("./path-engine");

class PredictiveReturnSignal {
  constructor(value) {
    this.value = value;
  }
}

class PredictiveSimulator {
  constructor(context = {}) {
    this.context = context;
    this.fileMap = context.fileMap || new Map();
    this.maxPaths = context.maxPaths || 50;
    this.maxLoopIterations = context.maxLoopIterations || 20;
    this.framesToSimulate = context.framesToSimulate || 5;
    this.moduleCache = new Map();
  }

  createInitialState(entryFile) {
    const baseScope = new PredictiveScope();
    const state = new PredictiveState({
      scope: baseScope,
      currentFile: entryFile,
    });

    this.defineBuiltins(state);
    this.context.baseScope = baseScope;
    return state;
  }

  simulate(entryFile) {
    const initialState = this.createInitialState(entryFile);
    let states = this.executeFile(entryFile, [initialState]);

    if (this.context.gameMode) {
      states = this.simulateGameFrames(states);
    }

    return capStates(states, this.maxPaths);
  }

  executeFile(filePath, states, options = {}) {
    const fileInfo = this.fileMap.get(filePath);
    if (!fileInfo) {
      return states.map((state) => {
        const next = state.clone();
        next.fail(`Predictor could not load '${filePath}'.`);
        return next;
      });
    }

    return this.executeStatements(fileInfo.program.body, states.map((state) => {
      const next = state.clone();
      next.currentFile = filePath;
      next.currentExports = options.asModule ? new Set() : next.currentExports;
      return next;
    }), filePath);
  }

  executeStatements(statements, states, filePath = null) {
    let currentStates = states;

    for (const statement of statements) {
      const nextStates = [];

      currentStates.forEach((state) => {
        if (state.terminated || state.returned) {
          nextStates.push(state);
          return;
        }

        nextStates.push(...this.executeStatement(statement, state, filePath || state.currentFile));
      });

      currentStates = capStates(nextStates, this.maxPaths);
    }

    return currentStates;
  }

  executeStatement(statement, state, filePath) {
    state.noteOperation();

    switch (statement.type) {
      case "BlockStatement":
        return this.executeBlock(statement.statements, state, filePath);
      case "ExportDeclaration": {
        const results = this.executeStatement(statement.declaration, state, filePath);
        results.forEach((result) => {
          const declaredName = this.getDeclaredName(statement.declaration);
          if (declaredName) {
            result.currentExports.add(declaredName);
          }
        });
        return results;
      }
      case "ImportStatement":
        return [this.executeImport(statement, state, filePath)];
      case "IntentDeclaration":
      case "LearnDeclaration":
        return [state];
      case "TypeDeclaration":
        state.scope.define(statement.name.lexeme, {
          __kind: "type",
          name: statement.name.lexeme,
          fields: statement.fields,
        });
        return [state];
      case "VariableDeclaration": {
        const value = this.evaluateExpression(statement.initializer, state, filePath);
        if (statement.typeAnnotation && !this.matchesTypeAnnotation(value, statement.typeAnnotation, state)) {
          state.fail(`Possible type mismatch for variable '${statement.name.lexeme}'.`);
        }
        state.scope.define(statement.name.lexeme, value, { declaredType: statement.typeAnnotation });
        return [state];
      }
      case "FunctionDeclaration":
        state.scope.define(statement.name.lexeme, {
          __kind: "function",
          name: statement.name.lexeme,
          declaration: statement,
          originScope: state.scope,
          isAsync: statement.isAsync,
        });
        return [state];
      case "ClassDeclaration": {
        const methods = new Map();
        statement.methods.forEach((method) => {
          methods.set(method.name.lexeme, {
            __kind: "function",
            name: method.name.lexeme,
            declaration: method,
            originScope: state.scope,
            isAsync: method.isAsync,
          });
        });
        state.scope.define(statement.name.lexeme, {
          __kind: "class",
          name: statement.name.lexeme,
          methods,
        });
        return [state];
      }
      case "TaskDeclaration":
        state.tasks.set(statement.name.lexeme, {
          __kind: "task",
          name: statement.name.lexeme,
          body: statement.body,
          executed: false,
          result: null,
        });
        state.scope.define(statement.name.lexeme, state.tasks.get(statement.name.lexeme));
        return [state];
      case "ServerDeclaration":
        state.servers.push({
          __kind: "server",
          routes: statement.routes,
          middleware: statement.middleware,
          filePath,
        });
        return [state];
      case "TestDeclaration":
        return [state];
      case "IfStatement":
        return this.executeIf(statement, state, filePath);
      case "LoopStatement":
        return this.executeLoop(statement, state, filePath);
      case "LoopForeverStatement":
        return this.executeForeverLoop(statement, state, filePath);
      case "ReturnStatement":
        state.returned = true;
        state.returnValue = statement.value ? this.evaluateExpression(statement.value, state, filePath) : null;
        return [state];
      case "ExpressionStatement":
        this.evaluateExpression(statement.expression, state, filePath);
        return [state];
      case "MemoryCommandStatement":
        return [state];
      default:
        state.warn(`Predictor does not fully support statement type '${statement.type}'.`);
        state.metrics.unsupported += 1;
        state.confidencePenalty += 3;
        return [state];
    }
  }

  executeBlock(statements, state, filePath) {
    const previousScope = state.scope;
    state.scope = new PredictiveScope(previousScope);
    const results = this.executeStatements(statements, [state], filePath);
    return results.map((result) => {
      result.scope = this.restoreScope(result.scope, previousScope);
      return result;
    });
  }

  executeImport(statement, state, filePath) {
    const importKind = statement.importKind || "mgl";
    const importedPath = resolveImportPath(filePath, statement.source.literal, importKind);

    if (importKind === "rust") {
      state.scope.define(
        statement.alias ? statement.alias.lexeme : path.basename(importedPath, path.extname(importedPath)),
        {
          __kind: "module",
          name: path.basename(importedPath, path.extname(importedPath)),
          exports: new Map(),
          opaque: true,
        },
      );
      state.warn(`Rust module '${statement.source.literal}' treated as an opaque native dependency during prediction.`);
      state.confidencePenalty += 4;
      return state;
    }

    if (this.moduleCache.has(importedPath)) {
      state.scope.define(
        statement.alias ? statement.alias.lexeme : path.basename(importedPath, path.extname(importedPath)),
        cloneValue(this.moduleCache.get(importedPath)),
      );
      return state;
    }

    const moduleState = new PredictiveState({
      scope: new PredictiveScope(this.context.baseScope),
      currentFile: importedPath,
      outputs: state.outputs,
      warnings: state.warnings,
      errors: state.errors,
      metrics: state.metrics,
      confidencePenalty: state.confidencePenalty,
      currentExports: new Set(),
    });
    this.defineBuiltins(moduleState);
    const moduleResults = this.executeFile(importedPath, [moduleState], { asModule: true });
    const moduleResult = moduleResults[0] || moduleState;
    const exports = new Map();

    moduleResult.currentExports.forEach((exportName) => {
      const binding = moduleResult.scope.getBinding(exportName);
      if (binding) {
        exports.set(exportName, cloneValue(binding.value));
      }
    });

    const moduleValue = {
      __kind: "module",
      name: path.basename(importedPath, path.extname(importedPath)),
      exports,
    };
    this.moduleCache.set(importedPath, moduleValue);
    state.scope.define(
      statement.alias ? statement.alias.lexeme : moduleValue.name,
      cloneValue(moduleValue),
    );
    state.outputs = [...moduleResult.outputs];
    state.warnings = [...moduleResult.warnings];
    state.errors = [...moduleResult.errors];
    state.metrics = { ...moduleResult.metrics };
    state.confidencePenalty = moduleResult.confidencePenalty;
    return state;
  }

  executeIf(statement, state, filePath) {
    const condition = this.evaluateExpression(statement.condition, state, filePath);
    const truthiness = isTruthy(condition);

    if (truthiness === true) {
      return this.executeStatement(statement.thenBranch, state, filePath);
    }

    if (truthiness === false) {
      return statement.elseBranch ? this.executeStatement(statement.elseBranch, state, filePath) : [state];
    }

    state.noteBranch();
    state.warn("Condition depends on an unknown runtime value. Exploring multiple outcomes.");
    state.confidencePenalty += 4;
    const thenState = state.clone();
    const elseState = state.clone();
    const thenResults = this.executeStatement(statement.thenBranch, thenState, filePath);
    const elseResults = statement.elseBranch
      ? this.executeStatement(statement.elseBranch, elseState, filePath)
      : [elseState];
    return [...thenResults, ...elseResults];
  }

  executeLoop(statement, state, filePath) {
    const start = this.evaluateExpression(statement.start, state, filePath);
    const end = this.evaluateExpression(statement.end, state, filePath);
    const step = statement.step ? this.evaluateExpression(statement.step, state, filePath) : 1;
    const startValue = this.toNumber(start);
    const endValue = this.toNumber(end);
    const stepValue = this.toNumber(step);
    let iterations = 0;

    state.metrics.loops += 1;

    if (startValue === null || endValue === null || stepValue === null || stepValue === 0) {
      state.warn("Loop bounds are not fully predictable. Simulating one conservative iteration.");
      state.confidencePenalty += 5;
      state.metrics.truncatedLoops += 1;
      return this.executeBlock(
        [
          {
            type: "VariableDeclaration",
            name: statement.iterator,
            initializer: { type: "Literal", value: 0 },
            typeAnnotation: null,
          },
          ...statement.body.statements,
        ],
        state,
        filePath,
      );
    }

    const results = [];
    const comparator = stepValue > 0
      ? (value) => value <= endValue
      : (value) => value >= endValue;

    let current = startValue;
    let activeStates = [state];
    while (comparator(current)) {
      iterations += 1;
      if (iterations > this.maxLoopIterations) {
        activeStates.forEach((activeState) => {
          activeState.warn(`Loop truncated after ${this.maxLoopIterations} iterations during prediction.`);
          activeState.metrics.truncatedLoops += 1;
          activeState.confidencePenalty += 5;
        });
        break;
      }

      activeStates = activeStates.flatMap((activeState) => {
        activeState.scope.define(statement.iterator.lexeme, current);
        activeState.noteOperation();
        return this.executeStatement(statement.body, activeState, filePath);
      });
      current += stepValue;
    }

    results.push(...activeStates);
    return results;
  }

  executeForeverLoop(statement, state, filePath) {
    state.warn("Possible infinite loop detected.");
    state.fail("Predicted infinite loop in top-level or function body.");
    state.metrics.truncatedLoops += 1;
    state.confidencePenalty += 10;
    const preview = this.executeStatement(statement.body, state.clone(), filePath);
    return preview.map((result) => {
      result.terminated = true;
      return result;
    });
  }

  evaluateExpression(expression, state, filePath) {
    state.noteOperation();

    switch (expression.type) {
      case "Literal":
        return expression.value;
      case "GroupingExpression":
        return this.evaluateExpression(expression.expression, state, filePath);
      case "Identifier":
        return this.readIdentifier(expression.name.lexeme, state);
      case "ArrayExpression": {
        const items = expression.elements.map((element) => this.evaluateExpression(element, state, filePath));
        state.noteAllocation({ tracked: false, frameScoped: this.context.gameMode && state.metrics.frames > 0 });
        return makeArray(items);
      }
      case "ObjectExpression": {
        const fields = {};
        expression.properties.forEach((property) => {
          fields[property.key.lexeme] = this.evaluateExpression(property.value, state, filePath);
        });
        state.noteAllocation({ tracked: false, frameScoped: this.context.gameMode && state.metrics.frames > 0 });
        return makeObject(fields);
      }
      case "TypeInitializerExpression": {
        const fields = {};
        expression.fields.forEach((field) => {
          fields[field.key.lexeme] = this.evaluateExpression(field.value, state, filePath);
        });
        state.noteAllocation({ tracked: false, frameScoped: this.context.gameMode && state.metrics.frames > 0 });
        return makeObject(fields, { typeName: expression.typeName.lexeme });
      }
      case "TrackExpression": {
        const value = this.evaluateExpression(expression.value, state, filePath);
        if (value && typeof value === "object") {
          value.tracked = true;
          state.noteAllocation({ tracked: true, frameScoped: this.context.gameMode && state.metrics.frames > 0 });
          return value;
        }

        state.noteAllocation({ tracked: true, frameScoped: this.context.gameMode && state.metrics.frames > 0 });
        return makeTrackedScalar(value);
      }
      case "AwaitExpression": {
        state.noteAsync();
        const awaited = this.evaluateExpression(expression.expression, state, filePath);
        return awaited && awaited.__kind === "future" ? awaited.value : awaited;
      }
      case "UnaryExpression":
        return this.evaluateUnary(expression, state, filePath);
      case "BinaryExpression":
        return this.evaluateBinary(expression, state, filePath);
      case "LogicalExpression":
        return this.evaluateLogical(expression, state, filePath);
      case "AssignmentExpression":
        return this.evaluateAssignment(expression, state, filePath);
      case "CallExpression":
        return this.evaluateCall(expression, state, filePath);
      case "GetExpression":
        return this.evaluateGet(expression, state, filePath);
      case "IndexExpression":
        return this.evaluateIndex(expression, state, filePath);
      default:
        state.warn(`Predictor does not fully support expression type '${expression.type}'.`);
        state.metrics.unsupported += 1;
        state.confidencePenalty += 2;
        return makeUnknown("any", expression.type);
    }
  }

  evaluateUnary(expression, state, filePath) {
    const right = unwrapValue(this.evaluateExpression(expression.right, state, filePath));
    if (isUnknown(right)) {
      return right;
    }

    switch (expression.operator.type) {
      case "BANG":
        return !right;
      case "MINUS":
        return typeof right === "number" ? -right : makeUnknown("number", "number");
      default:
        return makeUnknown("any", "unary");
    }
  }

  evaluateBinary(expression, state, filePath) {
    const left = this.evaluateExpression(expression.left, state, filePath);
    const right = this.evaluateExpression(expression.right, state, filePath);
    const rawLeft = unwrapValue(left);
    const rawRight = unwrapValue(right);

    if (isUnknown(rawLeft) || isUnknown(rawRight)) {
      return this.evaluateUnknownBinary(expression.operator.type, rawLeft, rawRight);
    }

    switch (expression.operator.type) {
      case "PLUS":
        if (typeof rawLeft === "number" && typeof rawRight === "number") {
          return rawLeft + rawRight;
        }
        return stringifyPredictiveValue(rawLeft) + stringifyPredictiveValue(rawRight);
      case "MINUS":
        return rawLeft - rawRight;
      case "STAR":
        return rawLeft * rawRight;
      case "SLASH":
        if (rawRight === 0) {
          state.fail("Possible division by zero.");
          return makeUnknown("number", "division");
        }
        return rawLeft / rawRight;
      case "PERCENT":
        if (rawRight === 0) {
          state.fail("Possible modulo by zero.");
          return makeUnknown("number", "modulo");
        }
        return rawLeft % rawRight;
      case "GREATER":
        return rawLeft > rawRight;
      case "GREATER_EQUAL":
        return rawLeft >= rawRight;
      case "LESS":
        return rawLeft < rawRight;
      case "LESS_EQUAL":
        return rawLeft <= rawRight;
      case "EQUAL_EQUAL":
        return this.structuralEquals(rawLeft, rawRight);
      case "BANG_EQUAL":
        return !this.structuralEquals(rawLeft, rawRight);
      default:
        return makeUnknown("any", "binary");
    }
  }

  evaluateUnknownBinary(operatorType, left, right) {
    const leftOptions = isUnknown(left) ? left.options : [left];
    const rightOptions = isUnknown(right) ? right.options : [right];
    const results = [];

    leftOptions.forEach((leftOption) => {
      rightOptions.forEach((rightOption) => {
        switch (operatorType) {
          case "EQUAL_EQUAL":
            results.push(this.structuralEquals(unwrapValue(leftOption), unwrapValue(rightOption)));
            break;
          case "BANG_EQUAL":
            results.push(!this.structuralEquals(unwrapValue(leftOption), unwrapValue(rightOption)));
            break;
          case "PLUS":
            results.push(
              typeof unwrapValue(leftOption) === "number" && typeof unwrapValue(rightOption) === "number"
                ? unwrapValue(leftOption) + unwrapValue(rightOption)
                : stringifyPredictiveValue(leftOption) + stringifyPredictiveValue(rightOption),
            );
            break;
          default:
            results.push(makeUnknown("any", "binary-branch"));
        }
      });
    });

    const concrete = results.filter((item) => !isUnknown(item));
    if (concrete.length > 0) {
      return makeUnknown(typeof concrete[0] === "boolean" ? "bool" : inferValueType(concrete[0]), "branch", concrete);
    }

    return makeUnknown("any", "branch");
  }

  evaluateLogical(expression, state, filePath) {
    const left = this.evaluateExpression(expression.left, state, filePath);
    const truthiness = isTruthy(left);

    if (expression.operator.type === "OR") {
      if (truthiness === true) {
        return left;
      }

      return truthiness === false ? this.evaluateExpression(expression.right, state, filePath) : makeUnknown("bool", "logical", [true, false]);
    }

    if (truthiness === false) {
      return left;
    }

    return truthiness === true ? this.evaluateExpression(expression.right, state, filePath) : makeUnknown("bool", "logical", [true, false]);
  }

  evaluateAssignment(expression, state, filePath) {
    const value = this.evaluateExpression(expression.value, state, filePath);

    if (expression.target.type === "Identifier") {
      const updated = state.scope.assign(expression.target.name.lexeme, value);
      if (updated === undefined) {
        state.fail(`Possible assignment to undefined variable '${expression.target.name.lexeme}'.`);
      }
      return value;
    }

    if (expression.target.type === "GetExpression") {
      const object = this.evaluateExpression(expression.target.object, state, filePath);
      return this.assignProperty(object, expression.target.name.lexeme, value, state);
    }

    if (expression.target.type === "IndexExpression") {
      const arrayValue = this.evaluateExpression(expression.target.object, state, filePath);
      const indexValue = this.evaluateExpression(expression.target.index, state, filePath);
      if (!isArrayValue(arrayValue)) {
        state.fail("Possible index assignment on non-array value.");
        return value;
      }

      const index = this.toNumber(indexValue);
      if (index === null || index < 0 || index >= arrayValue.items.length) {
        state.fail("Possible index out of bounds.");
        return value;
      }

      arrayValue.items[index] = value;
      return value;
    }

    return value;
  }

  evaluateCall(expression, state, filePath) {
    const callee = this.evaluateExpression(expression.callee, state, filePath);
    const args = expression.args.map((arg) => this.evaluateExpression(arg, state, filePath));

    if (!callee || !callee.__kind) {
      state.warn("Predictor encountered a call target it could not resolve.");
      state.metrics.unsupported += 1;
      return makeUnknown("any", "call");
    }

    if (callee.__kind === "native") {
      return callee.call(this, state, args, { filePath, call: expression });
    }

    if (callee.__kind === "function") {
      return this.executeFunction(callee, args, state, filePath);
    }

    if (callee.__kind === "class") {
      return this.instantiateClass(callee, args, state, filePath);
    }

    state.warn(`Predictor cannot call '${callee.__kind}' values.`);
    state.metrics.unsupported += 1;
    return makeUnknown("any", "call");
  }

  evaluateGet(expression, state, filePath) {
    const object = this.evaluateExpression(expression.object, state, filePath);

    if (!object) {
      state.fail(`Possible null access for property '${expression.name.lexeme}'.`);
      return makeUnknown("any", expression.name.lexeme);
    }

    if (object.__kind === "module") {
      if (object.exports.has(expression.name.lexeme)) {
        return cloneValue(object.exports.get(expression.name.lexeme));
      }

      state.fail(`Module '${object.name}' does not export '${expression.name.lexeme}'.`);
      return makeUnknown("any", expression.name.lexeme);
    }

    if (object.__kind === "class") {
      return object.methods.get(expression.name.lexeme) || makeUnknown("function", expression.name.lexeme);
    }

    if (object.__kind === "instance") {
      if (Object.prototype.hasOwnProperty.call(object.fields, expression.name.lexeme)) {
        return object.fields[expression.name.lexeme];
      }

      if (object.methods.has(expression.name.lexeme)) {
        return {
          ...object.methods.get(expression.name.lexeme),
          boundSelf: object,
        };
      }
    }

    if (isObjectValue(object) && object.fields && Object.prototype.hasOwnProperty.call(object.fields, expression.name.lexeme)) {
      return object.fields[expression.name.lexeme];
    }

    state.fail(`Possible undefined property '${expression.name.lexeme}'.`);
    return makeUnknown("any", expression.name.lexeme);
  }

  evaluateIndex(expression, state, filePath) {
    const target = this.evaluateExpression(expression.object, state, filePath);
    const indexValue = this.evaluateExpression(expression.index, state, filePath);
    const index = this.toNumber(indexValue);

    if (target && target.__kind === "array") {
      if (index === null || index < 0 || index >= target.items.length) {
        state.fail("Possible index out of bounds.");
        return makeUnknown("any", "index");
      }

      return target.items[index];
    }

    if (typeof target === "string") {
      if (index === null || index < 0 || index >= target.length) {
        state.fail("Possible string index out of bounds.");
        return makeUnknown("string", "index");
      }

      return target[index];
    }

    state.fail("Possible index access on non-indexable value.");
    return makeUnknown("any", "index");
  }

  executeFunction(func, args, state, filePath) {
    const previousScope = state.scope;
    const parentScope = func.originScope || previousScope;
    const callScope = new PredictiveScope(parentScope);
    const declaration = func.declaration;

    if (func.boundSelf) {
      callScope.define("self", func.boundSelf);
      if (this.context.gameMode) {
        this.injectUnityLocals(callScope, func.boundSelf);
      }
    }

    declaration.params.forEach((param, index) => {
      const argument = index < args.length ? args[index] : makeUnknown("any", param.name.lexeme);
      if (param.typeAnnotation && !this.matchesTypeAnnotation(argument, param.typeAnnotation, state)) {
        state.fail(`Possible type mismatch for parameter '${param.name.lexeme}'.`);
      }
      callScope.define(param.name.lexeme, argument, { declaredType: param.typeAnnotation });
    });

    state.scope = callScope;
    if (declaration.isAsync) {
      state.noteAsync();
    }

    try {
      const results = this.executeStatements(declaration.body.statements, [state], filePath);
      const resultState = results[0] || state;
      const returnValue = resultState.returned ? resultState.returnValue : null;
      resultState.returned = false;
      resultState.returnValue = null;
      resultState.scope = previousScope;
      return declaration.isAsync ? makeFuture(returnValue) : returnValue;
    } catch (error) {
      state.scope = previousScope;
      throw error;
    }
  }

  instantiateClass(klass, args, state, filePath) {
    const instance = {
      __kind: "instance",
      className: klass.name,
      fields: {},
      methods: new Map(klass.methods),
    };

    if (this.context.gameMode) {
      this.attachUnityFields(instance);
    }

    if (klass.methods.has("init")) {
      this.executeFunction({
        ...klass.methods.get("init"),
        boundSelf: instance,
      }, args, state, filePath);
    }

    state.noteAllocation({ tracked: false, frameScoped: this.context.gameMode && state.metrics.frames > 0 });
    return instance;
  }

  simulateGameFrames(states) {
    const resultStates = [];

    states.forEach((state) => {
      const classes = this.collectGameClasses(state.scope);
      if (classes.length === 0) {
        resultStates.push(state);
        return;
      }

      let activeStates = [state];
      classes.forEach((klass) => {
        activeStates = activeStates.flatMap((activeState) => {
          const nextState = activeState.clone();
          const instance = this.instantiateClass(klass, [], nextState, nextState.currentFile);
          nextState.gameObjects.push(instance);
          this.runLifecycleMethod(instance, "start", nextState);
          for (let frame = 0; frame < this.framesToSimulate; frame += 1) {
            nextState.metrics.frames += 1;
            const allocationsBefore = nextState.metrics.allocations;
            const operationsBefore = nextState.metrics.operations;
            this.runLifecycleMethod(instance, "update", nextState);
            this.runLifecycleMethod(instance, "fixedUpdate", nextState);
            nextState.metrics.perFrameAllocations = Math.max(
              nextState.metrics.perFrameAllocations,
              nextState.metrics.allocations - allocationsBefore,
            );
            nextState.metrics.perFrameOperations = Math.max(
              nextState.metrics.perFrameOperations,
              nextState.metrics.operations - operationsBefore,
            );
          }

          if (nextState.metrics.perFrameAllocations > 0) {
            nextState.warn("Allocation inside update() may cause frame drops.");
            nextState.metrics.possibleLeaks += nextState.metrics.perFrameAllocations;
          }

          if (nextState.metrics.perFrameOperations > 35) {
            nextState.warn("High per-frame cost predicted. Frame drops are likely.");
          }

          return [nextState];
        });
      });

      resultStates.push(...activeStates);
    });

    return resultStates;
  }

  runLifecycleMethod(instance, methodName, state) {
    if (!instance.methods.has(methodName)) {
      return;
    }

    const method = instance.methods.get(methodName);
    const result = this.executeFunction({
      ...method,
      boundSelf: instance,
    }, [], state, state.currentFile);

    if (result && result.__kind === "future") {
      return result.value;
    }

    return result;
  }

  collectGameClasses(scope) {
    const classes = [];
    const seen = new Set();
    let current = scope;

    while (current) {
      current.bindings.forEach((binding, name) => {
        if (seen.has(name)) {
          return;
        }
        seen.add(name);

        const value = binding.value;
        if (
          value
          && value.__kind === "class"
          && (value.methods.has("start") || value.methods.has("update") || value.methods.has("fixedUpdate"))
        ) {
          classes.push(value);
        }
      });
      current = current.parent;
    }

    return classes;
  }

  defineBuiltins(state) {
    const scope = state.scope;

    scope.define("print", makeNative("print", (_simulator, currentState, args) => {
      currentState.addOutput(args.map((arg) => stringifyPredictiveValue(arg)).join(" "));
      return null;
    }, { minArity: 0 }));

    scope.define("length", makeNative("length", (_simulator, currentState, args) => {
      const value = unwrapValue(args[0]);
      if (typeof value === "string") {
        return value.length;
      }
      if (value && value.__kind === "array") {
        return value.items.length;
      }
      currentState.warn("length() received a value with unknown size.");
      return makeUnknown("number", "length");
    }, { arity: 1 }));

    scope.define("len", scope.get("length"));

    scope.define("join", makeNative("join", (_simulator, _state, args) => {
      const target = unwrapValue(args[0]);
      const separator = stringifyPredictiveValue(args[1]);
      return target && target.__kind === "array"
        ? target.items.map((item) => stringifyPredictiveValue(item)).join(separator)
        : makeUnknown("string", "join");
    }, { arity: 2 }));

    scope.define("range", makeNative("range", (_simulator, currentState, args) => {
      const start = this.toNumber(args[0]);
      const end = this.toNumber(args[1]);
      const step = args.length > 2 ? this.toNumber(args[2]) : start <= end ? 1 : -1;
      if (start === null || end === null || step === null || step === 0) {
        currentState.warn("range() arguments are not fully predictable.");
        return makeArray([]);
      }
      const items = [];
      const predicate = step > 0
        ? (value) => value <= end
        : (value) => value >= end;
      for (let current = start; predicate(current); current += step) {
        items.push(current);
      }
      currentState.noteAllocation();
      return makeArray(items);
    }, { minArity: 2, maxArity: 3 }));

    scope.define("push", makeNative("push", (_simulator, currentState, args) => {
      const target = args[0];
      if (!target || target.__kind !== "array") {
        currentState.fail("push() may receive a non-array value.");
        return makeUnknown("number", "push");
      }

      target.items.push(args[1]);
      return target.items.length;
    }, { arity: 2 }));

    scope.define("contains", makeNative("contains", (_simulator, _state, args) => {
      const target = unwrapValue(args[0]);
      const value = unwrapValue(args[1]);
      if (typeof target === "string") {
        return target.includes(String(value));
      }
      if (target && target.__kind === "array") {
        return target.items.some((item) => this.structuralEquals(unwrapValue(item), value));
      }
      return makeUnknown("bool", "contains");
    }, { arity: 2 }));

    scope.define("assert", makeNative("assert", (_simulator, currentState, args) => {
      const truthiness = isTruthy(args[0]);
      if (truthiness === false) {
        currentState.fail(args[1] ? stringifyPredictiveValue(args[1]) : "Assertion may fail.");
      } else if (truthiness === "unknown") {
        currentState.warn(args[1] ? `${stringifyPredictiveValue(args[1])} (condition uncertain)` : "Assertion result is uncertain.");
        currentState.confidencePenalty += 3;
      }
      return null;
    }, { minArity: 1, maxArity: 2 }));

    scope.define("type", makeNative("type", (_simulator, _state, args) => inferValueType(args[0]), { arity: 1 }));
    scope.define("str", makeNative("str", (_simulator, _state, args) => stringifyPredictiveValue(args[0]), { arity: 1 }));
    scope.define("num", makeNative("num", (_simulator, _state, args) => {
      const numeric = Number(unwrapValue(args[0]));
      return Number.isNaN(numeric) ? makeUnknown("number", "num") : numeric;
    }, { arity: 1 }));
    scope.define("random", makeNative("random", () => makeUnknown("number", "random", [0.1, 0.5, 0.9]), { arity: 0 }));
    scope.define("clock", makeNative("clock", () => makeUnknown("number", "clock"), { arity: 0 }));
    scope.define("input", makeNative("input", () => makeUnknown("string", "input", ["yes", "no", ""]), { minArity: 0, maxArity: 1 }));
    scope.define("sleep", makeNative("sleep", () => makeFuture(null), { arity: 1 }));
    scope.define("waitTask", makeNative("waitTask", (_simulator, currentState, args) => this.waitTask(args[0], currentState), { arity: 1 }));
    scope.define("taskStatus", makeNative("taskStatus", (_simulator, _state, args) => args[0]?.status || "unknown", { arity: 1 }));
    scope.define("isTracked", makeNative("isTracked", (_simulator, _state, args) => isTrackedValue(args[0]), { arity: 1 }));
    scope.define("snapshotMemory", makeNative("snapshotMemory", (_simulator, currentState) => makeObject({
      allocationCount: currentState.metrics.allocations,
      trackedAllocations: currentState.metrics.trackedAllocations,
    }), { minArity: 0, maxArity: 1 }));
    scope.define("memoryOf", makeNative("memoryOf", (_simulator, _state, args) => makeObject({
      tracked: isTrackedValue(args[0]),
      type: inferValueType(args[0]),
    }), { arity: 1 }));
    scope.define("whyAlive", makeNative("whyAlive", (_simulator, _state, args) => (
      isTrackedValue(args[0])
        ? "Tracked value may remain alive while referenced by current scope."
        : "Value is not explicitly tracked."
    ), { arity: 1 }));
    scope.define("optimize", makeNative("optimize", (_simulator, _state, args) => (
      isTrackedValue(args[0])
        ? "Consider reusing this tracked value across iterations."
        : "No explicit optimization hint."
    ), { arity: 1 }));
    scope.define("memoryWarnings", makeNative("memoryWarnings", () => makeArray([]), { arity: 0 }));
    scope.define("Vector3", makeNative("Vector3", (_simulator, currentState, args) => {
      currentState.noteAllocation({ frameScoped: this.context.gameMode && currentState.metrics.frames > 0 });
      return makeVector3(args[0] ?? 0, args[1] ?? 0, args[2] ?? 0);
    }, { arity: 3 }));
    scope.define("Input", makeObject({
      getAxis: makeNative("Input.getAxis", () => makeUnknown("number", "Input.getAxis", [-1, 0, 1]), { arity: 1 }),
      getKey: makeNative("Input.getKey", () => makeUnknown("bool", "Input.getKey", [true, false]), { arity: 1 }),
      getKeyDown: makeNative("Input.getKeyDown", () => makeUnknown("bool", "Input.getKeyDown", [true, false]), { arity: 1 }),
    }));
  }

  waitTask(handle, state) {
    if (!handle || handle.__kind !== "task") {
      state.warn("waitTask() may receive a non-task value.");
      return null;
    }

    if (handle.executed) {
      return handle.result;
    }

    handle.executed = true;
    handle.status = "completed";
    const taskState = state.clone();
    const results = this.executeStatement(handle.body, taskState, taskState.currentFile);
    const finalState = results[0] || taskState;
    handle.result = finalState.returnValue;
    state.outputs = [...finalState.outputs];
    state.warnings = [...finalState.warnings];
    state.errors = [...finalState.errors];
    state.metrics = { ...finalState.metrics };
    return handle.result;
  }

  readIdentifier(name, state) {
    const binding = state.scope.getBinding(name);
    if (!binding) {
      state.fail(`Possible use of undefined variable '${name}'.`);
      return makeUnknown("any", name);
    }
    return binding.value;
  }

  assignProperty(target, propertyName, value, state) {
    if (!target || !isObjectValue(target)) {
      state.fail(`Possible null access when assigning '${propertyName}'.`);
      return value;
    }

    if (!target.fields) {
      target.fields = {};
    }
    target.fields[propertyName] = value;
    return value;
  }

  restoreScope(currentScope, targetScope) {
    let scope = currentScope;
    while (scope && scope !== targetScope) {
      scope = scope.parent;
    }
    return targetScope;
  }

  attachUnityFields(instance) {
    instance.fields.transform = makeObject({
      position: makeVector3(0, 0, 0),
    }, { typeName: "Transform" });
    instance.fields.gameObject = makeObject({
      name: instance.className,
      activeSelf: true,
    }, { typeName: "GameObject" });
    instance.fields.rigidbody = makeObject({
      velocity: makeVector3(0, 0, 0),
    }, { typeName: "Rigidbody" });
  }

  injectUnityLocals(scope, instance) {
    scope.define("transform", instance.fields.transform);
    scope.define("gameObject", instance.fields.gameObject);
    scope.define("rigidbody", instance.fields.rigidbody);
    scope.define("Input", this.context.baseScope.get("Input"));
    scope.define("Vector3", this.context.baseScope.get("Vector3"));
  }

  matchesTypeAnnotation(value, annotation, state) {
    if (!annotation) {
      return true;
    }

    if (annotation.type === "ArrayType") {
      if (!isArrayValue(value)) {
        return false;
      }
      return value.items.every((item) => this.matchesTypeAnnotation(item, annotation.elementType, state));
    }

    const typeName = annotation.name.lexeme;
    switch (typeName) {
      case "number":
        return inferValueType(value) === "number";
      case "string":
        return inferValueType(value) === "string";
      case "bool":
      case "boolean":
        return inferValueType(value) === "bool";
      case "array":
        return isArrayValue(value);
      case "void":
        return value === null;
      default: {
        const runtimeValue = state.scope.get(typeName);
        if (runtimeValue && runtimeValue.__kind === "class") {
          return value && value.__kind === "instance" && value.className === runtimeValue.name;
        }
        return true;
      }
    }
  }

  structuralEquals(left, right) {
    if (left && left.__kind === "vector3" && right && right.__kind === "vector3") {
      return this.structuralEquals(left.x, right.x)
        && this.structuralEquals(left.y, right.y)
        && this.structuralEquals(left.z, right.z);
    }

    return JSON.stringify(left) === JSON.stringify(right);
  }

  toNumber(value) {
    const rawValue = unwrapValue(value);
    if (typeof rawValue === "number" && !Number.isNaN(rawValue)) {
      return rawValue;
    }

    if (isUnknown(rawValue) && rawValue.options.length > 0) {
      const numericOption = rawValue.options.find((option) => typeof unwrapValue(option) === "number");
      return numericOption !== undefined ? unwrapValue(numericOption) : null;
    }

    return null;
  }

  getDeclaredName(declaration) {
    switch (declaration.type) {
      case "VariableDeclaration":
      case "FunctionDeclaration":
      case "ClassDeclaration":
      case "TypeDeclaration":
      case "TaskDeclaration":
        return declaration.name.lexeme;
      default:
        return null;
    }
  }
}

module.exports = {
  PredictiveSimulator,
};
