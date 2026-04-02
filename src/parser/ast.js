function program(body) {
  return { type: "Program", body };
}

function blockStatement(statements) {
  return { type: "BlockStatement", statements };
}

function exportDeclaration(declaration) {
  return { type: "ExportDeclaration", declaration };
}

function typeDeclaration(name, fields) {
  return { type: "TypeDeclaration", name, fields };
}

function typeField(name, typeAnnotation) {
  return { type: "TypeField", name, typeAnnotation };
}

function importStatement(source, alias = null, importKind = "mgl") {
  return { type: "ImportStatement", source, alias, importKind };
}

function intentDeclaration(properties) {
  return { type: "IntentDeclaration", properties };
}

function learnDeclaration(properties) {
  return { type: "LearnDeclaration", properties };
}

function testDeclaration(name, body) {
  return { type: "TestDeclaration", name, body };
}

function taskDeclaration(name, body) {
  return { type: "TaskDeclaration", name, body };
}

function serverDeclaration(routes, middleware) {
  return { type: "ServerDeclaration", routes, middleware };
}

function routeDeclaration(path, method, body) {
  return { type: "RouteDeclaration", path, method, body };
}

function middlewareDeclaration(body) {
  return { type: "MiddlewareDeclaration", body };
}

function variableDeclaration(name, initializer, typeAnnotation = null) {
  return { type: "VariableDeclaration", name, initializer, typeAnnotation };
}

function functionDeclaration(name, params, body, returnType = null, isAsync = false) {
  return { type: "FunctionDeclaration", name, params, body, returnType, isAsync };
}

function classDeclaration(name, methods) {
  return { type: "ClassDeclaration", name, methods };
}

function ifStatement(condition, thenBranch, elseBranch) {
  return { type: "IfStatement", condition, thenBranch, elseBranch };
}

function loopStatement(iterator, start, end, step, body) {
  return { type: "LoopStatement", iterator, start, end, step, body };
}

function loopForeverStatement(body, keyword) {
  return { type: "LoopForeverStatement", body, keyword };
}

function returnStatement(keyword, value) {
  return { type: "ReturnStatement", keyword, value };
}

function expressionStatement(expression) {
  return { type: "ExpressionStatement", expression };
}

function memoryCommandStatement(keyword, expression, command) {
  return { type: "MemoryCommandStatement", keyword, expression, command };
}

function assignmentExpression(target, value, operator) {
  return { type: "AssignmentExpression", target, value, operator };
}

function binaryExpression(left, operator, right) {
  return { type: "BinaryExpression", left, operator, right };
}

function logicalExpression(left, operator, right) {
  return { type: "LogicalExpression", left, operator, right };
}

function unaryExpression(operator, right) {
  return { type: "UnaryExpression", operator, right };
}

function awaitExpression(keyword, expression) {
  return { type: "AwaitExpression", keyword, expression };
}

function trackExpression(keyword, value) {
  return { type: "TrackExpression", keyword, value };
}

function callExpression(callee, paren, args) {
  return { type: "CallExpression", callee, paren, args };
}

function getExpression(object, name) {
  return { type: "GetExpression", object, name };
}

function indexExpression(object, index, bracket) {
  return { type: "IndexExpression", object, index, bracket };
}

function typeInitializerExpression(typeName, fields, brace) {
  return { type: "TypeInitializerExpression", typeName, fields, brace };
}

function grouping(expression) {
  return { type: "GroupingExpression", expression };
}

function identifier(name) {
  return { type: "Identifier", name };
}

function literal(value) {
  return { type: "Literal", value };
}

function parameter(name, typeAnnotation = null) {
  return { type: "Parameter", name, typeAnnotation };
}

function arrayExpression(elements) {
  return { type: "ArrayExpression", elements };
}

function objectExpression(properties, brace = null) {
  return { type: "ObjectExpression", properties, brace };
}

function objectProperty(key, value) {
  return { type: "ObjectProperty", key, value };
}

function namedType(name) {
  return { type: "NamedType", name };
}

function arrayType(keyword, elementType) {
  return { type: "ArrayType", keyword, elementType };
}

module.exports = {
  arrayExpression,
  arrayType,
  assignmentExpression,
  awaitExpression,
  binaryExpression,
  blockStatement,
  callExpression,
  classDeclaration,
  loopForeverStatement,
  memoryCommandStatement,
  middlewareDeclaration,
  objectExpression,
  objectProperty,
  exportDeclaration,
  expressionStatement,
  functionDeclaration,
  getExpression,
  grouping,
  identifier,
  intentDeclaration,
  indexExpression,
  importStatement,
  ifStatement,
  learnDeclaration,
  literal,
  logicalExpression,
  loopStatement,
  namedType,
  routeDeclaration,
  serverDeclaration,
  taskDeclaration,
  testDeclaration,
  trackExpression,
  parameter,
  program,
  returnStatement,
  typeDeclaration,
  typeField,
  typeInitializerExpression,
  unaryExpression,
  variableDeclaration,
};
