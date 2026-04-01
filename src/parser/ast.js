function program(body) {
  return { type: "Program", body };
}

function blockStatement(statements) {
  return { type: "BlockStatement", statements };
}

function importStatement(source) {
  return { type: "ImportStatement", source };
}

function variableDeclaration(name, initializer) {
  return { type: "VariableDeclaration", name, initializer };
}

function functionDeclaration(name, params, body) {
  return { type: "FunctionDeclaration", name, params, body };
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

function returnStatement(keyword, value) {
  return { type: "ReturnStatement", keyword, value };
}

function expressionStatement(expression) {
  return { type: "ExpressionStatement", expression };
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

function callExpression(callee, paren, args) {
  return { type: "CallExpression", callee, paren, args };
}

function getExpression(object, name) {
  return { type: "GetExpression", object, name };
}

function indexExpression(object, index, bracket) {
  return { type: "IndexExpression", object, index, bracket };
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

function arrayExpression(elements) {
  return { type: "ArrayExpression", elements };
}

module.exports = {
  arrayExpression,
  assignmentExpression,
  binaryExpression,
  blockStatement,
  callExpression,
  classDeclaration,
  expressionStatement,
  functionDeclaration,
  getExpression,
  grouping,
  identifier,
  indexExpression,
  importStatement,
  ifStatement,
  literal,
  logicalExpression,
  loopStatement,
  program,
  returnStatement,
  unaryExpression,
  variableDeclaration,
};
