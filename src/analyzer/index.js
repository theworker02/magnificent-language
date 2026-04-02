const path = require("path");

const { inspectProject, resolveImportPath } = require("../tooling/inspector");
const { buildRefactorPlan } = require("../refactor");
const { prepareIntelligenceContext, finalizeLearning } = require("../intelligence");

function analyzeProject(entryFile, options = {}) {
  const rootDirectory = options.rootDirectory || path.dirname(path.resolve(entryFile));
  const inspectedProject = inspectProject(entryFile);
  const files = inspectedProject.files.map((file) => analyzeFile(file));
  const intelligence = prepareIntelligenceContext({
    config: options.config || {},
    files,
    rootDirectory,
  });

  const analysis = {
    entryFile: path.resolve(entryFile),
    rootDirectory,
    files,
    intent: intelligence.intent,
    learn: intelligence.learn,
    graph: buildGraph(files),
    patterns: [],
    suggestions: [],
    performance: [],
    memoryInsights: [],
    explanation: null,
    health: null,
    refactors: [],
    learningNote: null,
  };

  analysis.patterns = detectPatterns(analysis);
  analysis.performance = detectPerformanceInsights(analysis);
  analysis.memoryInsights = detectMemoryInsights(analysis);
  analysis.suggestions = prioritizeSuggestions(
    analysis,
    [
      ...detectArchitectureSuggestions(analysis),
      ...analysis.performance,
      ...analysis.memoryInsights,
    ],
  );
  analysis.explanation = buildExplanation(analysis);
  analysis.refactors = buildRefactorPlan(analysis);
  analysis.health = buildHealth(analysis);

  if (intelligence.learningProfile) {
    const persisted = finalizeLearning(intelligence, analysis);
    analysis.learningNote = persisted
      ? buildLearningNote(persisted, analysis.suggestions)
      : null;
  }

  return analysis;
}

function analyzeFile(file) {
  const functions = [];
  const tasks = [];
  const tests = [];
  const intents = [];
  const learnBlocks = [];
  const imports = [];
  const variableNames = [];
  const server = {
    routes: [],
    middlewareCount: 0,
  };
  const metrics = {
    complexity: 1,
    branches: 0,
    loops: 0,
    awaits: 0,
    assignments: 0,
    trackExpressions: 0,
    topLevelStatements: file.program.body.length,
    mutableGlobals: 0,
    nestedLoopDepth: 0,
    loopAllocations: 0,
  };
  const suggestions = [];

  file.program.body.forEach((statement) => {
    if (statement.type === "IntentDeclaration") {
      intents.push({
        line: getNodeLine(statement),
        values: propertiesToMetadata(statement.properties),
      });
    }

    if (statement.type === "LearnDeclaration") {
      learnBlocks.push({
        line: getNodeLine(statement),
        values: propertiesToMetadata(statement.properties),
      });
    }

    if (statement.type === "ImportStatement") {
      imports.push({
        specifier: statement.source.literal,
        resolvedPath: resolveImportPath(file.filePath, statement.source.literal),
        line: statement.source.line,
      });
    }

    if (statement.type === "VariableDeclaration") {
      metrics.mutableGlobals += 1;
      variableNames.push({
        name: statement.name.lexeme,
        suggestedName: suggestVariableName(statement),
        reason: explainVariableRename(statement),
        line: statement.name.line,
      });
    }
  });

  walk(file.program, (node, context) => {
    switch (node.type) {
      case "FunctionDeclaration":
        functions.push({
          name: node.name.lexeme,
          line: node.name.line,
          async: node.isAsync,
          statementCount: countStatements(node.body),
          complexity: computeFunctionComplexity(node),
          awaitCount: countNodes(node.body, "AwaitExpression"),
          loopCount: countNodes(node.body, "LoopStatement") + countNodes(node.body, "LoopForeverStatement"),
          branchCount: countNodes(node.body, "IfStatement"),
          paramCount: node.params.length,
        });
        break;
      case "TaskDeclaration":
        tasks.push({
          name: node.name.lexeme,
          line: node.name.line,
        });
        break;
      case "TestDeclaration":
        tests.push({
          name: node.name.literal,
          line: node.name.line,
        });
        break;
      case "ServerDeclaration":
        server.middlewareCount += node.middleware.length;
        break;
      case "RouteDeclaration":
        server.routes.push({
          path: node.path.literal,
          method: node.method ? node.method.literal.toUpperCase() : "GET",
          line: node.path.line,
          statementCount: countStatements(node.body),
        });
        break;
      case "IfStatement":
        metrics.complexity += 2;
        metrics.branches += 1;
        break;
      case "LoopStatement":
      case "LoopForeverStatement":
        metrics.complexity += 3;
        metrics.loops += 1;
        metrics.nestedLoopDepth = Math.max(metrics.nestedLoopDepth, context.loopDepth + 1);
        if (containsAllocationLikeNode(node.body)) {
          metrics.loopAllocations += 1;
        }
        break;
      case "AwaitExpression":
        metrics.awaits += 1;
        break;
      case "AssignmentExpression":
        metrics.assignments += 1;
        break;
      case "TrackExpression":
        metrics.trackExpressions += 1;
        break;
      default:
        break;
    }
  });

  functions
    .filter((func) => func.statementCount >= 12 || func.complexity >= 16)
    .forEach((func) => {
      suggestions.push({
        code: "large_function",
        severity: "warning",
        category: "architecture",
        filePath: file.filePath,
        line: func.line,
        message: `Function '${func.name}' is too large. Suggest splitting into smaller units.`,
        why: `It contains ${func.statementCount} statements with complexity ${func.complexity}.`,
      });
    });

  return {
    filePath: file.filePath,
    source: file.source,
    imports,
    intents,
    learnBlocks,
    functions,
    tasks,
    tests,
    server,
    variableNames,
    metrics,
    suggestions,
  };
}

function detectPatterns(analysis) {
  const patterns = [];

  if (analysis.files.some((file) => file.server.routes.length > 0)) {
    patterns.push("Detected API/server architecture.");
  }

  if (analysis.files.some((file) => file.tasks.length > 0)) {
    patterns.push("Detected background task orchestration.");
  }

  if (analysis.files.some((file) => file.metrics.trackExpressions > 0)) {
    patterns.push("Detected Living Memory Architecture usage.");
  }

  if (analysis.intent.goal) {
    patterns.push(`Declared intent goal: ${analysis.intent.goal}.`);
  }

  if (analysis.intent.priority) {
    patterns.push(`Declared intent priority: ${analysis.intent.priority}.`);
  }

  return patterns;
}

function detectArchitectureSuggestions(analysis) {
  const suggestions = [...analysis.files.flatMap((file) => file.suggestions)];

  analysis.files.forEach((file) => {
    if (file.server.routes.length >= 4 && file.imports.length <= 1) {
      suggestions.push({
        code: "monolithic_routes",
        severity: "warning",
        category: "architecture",
        filePath: file.filePath,
        line: file.server.routes[0].line,
        message: "Detected monolithic route structure. Suggest splitting routes into modules.",
        why: `The file handles ${file.server.routes.length} routes with only ${file.imports.length} imported modules.`,
      });
    }

    if (file.imports.length >= 4) {
      suggestions.push({
        code: "tight_coupling",
        severity: "warning",
        category: "architecture",
        filePath: file.filePath,
        line: file.imports[0].line,
        message: "High import fan-in suggests tight coupling. Consider introducing focused service modules.",
        why: `This file imports ${file.imports.length} modules directly.`,
      });
    }

    if (file.metrics.topLevelStatements >= 8 && file.imports.length <= 1) {
      suggestions.push({
        code: "poor_modularization",
        severity: "warning",
        category: "architecture",
        filePath: file.filePath,
        line: 1,
        message: "Top-level logic is concentrated in one file. Consider extracting modules for clearer boundaries.",
        why: `There are ${file.metrics.topLevelStatements} top-level statements with limited modular separation.`,
      });
    }
  });

  return suggestions;
}

function detectPerformanceInsights(analysis) {
  const suggestions = [];

  analysis.files.forEach((file) => {
    file.functions
      .filter((func) => func.async && func.awaitCount === 0)
      .forEach((func) => {
        suggestions.push({
          code: "async_without_await",
          severity: "info",
          category: "performance",
          filePath: file.filePath,
          line: func.line,
          message: `Async function '${func.name}' does not await anything. Consider removing async overhead or adding real async work.`,
          why: "The function returns a future wrapper without internal awaits.",
        });
      });

    if (file.metrics.loopAllocations > 0) {
      suggestions.push({
        code: "allocations_in_loop",
        severity: "warning",
        category: "performance",
        filePath: file.filePath,
        line: 1,
        message: "Detected allocation-heavy loop bodies. Consider reusing arrays or objects across iterations.",
        why: `Found ${file.metrics.loopAllocations} loop bodies that allocate arrays, objects, or tracked values.`,
      });
    }

    if (file.metrics.nestedLoopDepth >= 2) {
      suggestions.push({
        code: "nested_loops",
        severity: "warning",
        category: "performance",
        filePath: file.filePath,
        line: 1,
        message: "Nested loops may become a hotspot as data grows.",
        why: `Maximum detected loop nesting depth is ${file.metrics.nestedLoopDepth}.`,
      });
    }
  });

  return suggestions;
}

function detectMemoryInsights(analysis) {
  const suggestions = [];

  analysis.files.forEach((file) => {
    if (file.metrics.trackExpressions > 0 && file.server.routes.length > 0) {
      suggestions.push({
        code: "tracked_server_state",
        severity: "info",
        category: "memory",
        filePath: file.filePath,
        line: 1,
        message: "Tracked values in server-oriented code may persist for the process lifetime and increase memory pressure.",
        why: "Server modules tend to remain live while the application is running.",
      });
    }

    if (file.metrics.loopAllocations > 0 && file.metrics.trackExpressions > 0) {
      suggestions.push({
        code: "tracked_allocations_in_loop",
        severity: "warning",
        category: "memory",
        filePath: file.filePath,
        line: 1,
        message: "Tracked allocations are created inside loop-heavy code. Consider compacting or reusing these values.",
        why: "Tracked values inside loops amplify allocation visibility and retention pressure.",
      });
    }
  });

  return suggestions;
}

function prioritizeSuggestions(analysis, suggestions) {
  const priority = String(analysis.intent.priority || "").toLowerCase();
  const goal = String(analysis.intent.goal || "").toLowerCase();

  return suggestions
    .map((suggestion) => ({
      ...suggestion,
      priorityScore: getPriorityScore(suggestion, priority, goal),
    }))
    .sort((left, right) => right.priorityScore - left.priorityScore || left.filePath.localeCompare(right.filePath));
}

function buildExplanation(analysis) {
  const importedModules = new Set(analysis.graph.dependencies.map((dependency) => shortPath(analysis.rootDirectory, dependency.to)));
  const totalRoutes = analysis.files.reduce((total, file) => total + file.server.routes.length, 0);
  const totalTasks = analysis.files.reduce((total, file) => total + file.tasks.length, 0);

  return {
    summary: [
      importedModules.size > 0
        ? `The project coordinates ${importedModules.size} imported module(s) from the entry file.`
        : "The project runs without additional module imports.",
      totalRoutes > 0
        ? `It defines ${totalRoutes} HTTP route(s) through MGL's built-in server system.`
        : "It does not declare an HTTP server.",
      totalTasks > 0
        ? `It launches ${totalTasks} background task declaration(s).`
        : "It does not declare background tasks.",
      analysis.files.some((file) => file.metrics.trackExpressions > 0)
        ? "Tracked values participate in the Living Memory Architecture."
        : "The program does not explicitly track memory-sensitive values.",
    ],
    dataFlow: [
      analysis.intent.goal
        ? `Intent metadata sets the project goal to '${analysis.intent.goal}'.`
        : "No explicit intent goal was declared.",
      totalRoutes > 0
        ? "Requests enter through server routes, then flow through middleware and route handlers."
        : "Execution flows through top-level declarations and invoked functions.",
      analysis.files.some((file) => file.functions.some((func) => func.async))
        ? "Async functions introduce deferred work through futures and awaited operations."
        : "Control flow is primarily synchronous.",
    ],
  };
}

function buildHealth(analysis) {
  const averageComplexity = average(analysis.files.map((file) => file.metrics.complexity));
  const complexity = clamp(Math.round(100 - averageComplexity * 4));
  const maintainability = clamp(Math.round(100 - analysis.suggestions.length * 6 - countCategory(analysis.suggestions, "architecture") * 4));
  const performance = clamp(Math.round(100 - analysis.performance.length * 10));
  const memory = clamp(Math.round(100 - analysis.memoryInsights.length * 10));
  const overall = clamp(Math.round((complexity + maintainability + performance + memory) / 4));

  return {
    complexity,
    maintainability,
    performance,
    memory,
    overall,
  };
}

function buildGraph(files) {
  return {
    dependencies: files.flatMap((file) => file.imports.map((entry) => ({
      from: file.filePath,
      to: entry.resolvedPath,
    }))),
  };
}

function buildLearningNote(profile, suggestions) {
  if (!profile || suggestions.length === 0) {
    return null;
  }

  const recurring = suggestions
    .map((suggestion) => ({
      code: suggestion.code,
      count: profile.patterns[suggestion.code] || 0,
    }))
    .filter((entry) => entry.count >= 2)
    .sort((left, right) => right.count - left.count)[0];

  if (!recurring) {
    return `Learning mode has recorded ${profile.runs} analysis run(s).`;
  }

  return `Recurring pattern '${recurring.code}' has appeared ${recurring.count} time(s) across analyses.`;
}

function suggestVariableName(statement) {
  if (statement.name.lexeme.length > 2) {
    return statement.name.lexeme;
  }

  const initializer = statement.initializer;
  if (!initializer) {
    return "value";
  }

  if (initializer.type === "CallExpression" && initializer.callee.type === "Identifier") {
    return `${initializer.callee.name.lexeme}Result`;
  }

  if (initializer.type === "ArrayExpression") {
    return "items";
  }

  if (initializer.type === "ObjectExpression") {
    return "payload";
  }

  if (initializer.type === "TrackExpression") {
    return "trackedValue";
  }

  return "value";
}

function explainVariableRename(statement) {
  if (statement.name.lexeme.length > 2) {
    return "The variable name is already descriptive.";
  }

  return `The name '${statement.name.lexeme}' is short enough to hide intent at the call site.`;
}

function propertiesToMetadata(properties) {
  return Object.fromEntries(properties.map((property) => [property.key.lexeme, literalOrDescription(property.value)]));
}

function literalOrDescription(expression) {
  switch (expression.type) {
    case "Literal":
      return expression.value;
    case "Identifier":
      return expression.name.lexeme;
    case "ObjectExpression":
      return Object.fromEntries(expression.properties.map((property) => [property.key.lexeme, literalOrDescription(property.value)]));
    case "ArrayExpression":
      return expression.elements.map((element) => literalOrDescription(element));
    default:
      return expression.type;
  }
}

function containsAllocationLikeNode(node) {
  let found = false;
  walk(node, (child) => {
    if (found) {
      return;
    }

    if (child.type === "ArrayExpression" || child.type === "ObjectExpression" || child.type === "TrackExpression") {
      found = true;
    }
  });
  return found;
}

function countStatements(blockStatement) {
  return countNodes(blockStatement, [
    "VariableDeclaration",
    "ExpressionStatement",
    "IfStatement",
    "LoopStatement",
    "LoopForeverStatement",
    "ReturnStatement",
  ]);
}

function computeFunctionComplexity(node) {
  return 1
    + countNodes(node.body, "IfStatement") * 2
    + (countNodes(node.body, "LoopStatement") + countNodes(node.body, "LoopForeverStatement")) * 3
    + countNodes(node.body, "AwaitExpression");
}

function countNodes(node, types) {
  const accepted = new Set(Array.isArray(types) ? types : [types]);
  let count = 0;

  walk(node, (child) => {
    if (accepted.has(child.type)) {
      count += 1;
    }
  });

  return count;
}

function walk(node, visitor, context = { loopDepth: 0 }) {
  if (!node || typeof node !== "object") {
    return;
  }

  if (Array.isArray(node)) {
    node.forEach((item) => walk(item, visitor, context));
    return;
  }

  visitor(node, context);

  const nextContext = (
    node.type === "LoopStatement" || node.type === "LoopForeverStatement"
  )
    ? { ...context, loopDepth: context.loopDepth + 1 }
    : context;

  Object.values(node).forEach((value) => {
    if (value && typeof value === "object") {
      walk(value, visitor, nextContext);
    }
  });
}

function getNodeLine(node) {
  return node.name?.line
    || node.path?.line
    || node.keyword?.line
    || 1;
}

function getPriorityScore(suggestion, priority, goal) {
  let score = 10;

  if (suggestion.severity === "warning") {
    score += 10;
  }

  if (suggestion.category === "performance" && priority === "performance") {
    score += 10;
  }

  if (suggestion.code === "monolithic_routes" && goal.includes("api")) {
    score += 10;
  }

  if (suggestion.category === "memory" && priority === "performance") {
    score += 4;
  }

  return score;
}

function average(values) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function countCategory(entries, category) {
  return entries.filter((entry) => entry.category === category).length;
}

function clamp(value) {
  return Math.max(0, Math.min(100, value));
}

function shortPath(rootDirectory, filePath) {
  return filePath.startsWith(rootDirectory)
    ? filePath.slice(rootDirectory.length + 1)
    : filePath;
}

module.exports = {
  analyzeProject,
};
