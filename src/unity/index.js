const fs = require("fs");
const path = require("path");

const { inspectProject } = require("../tooling/inspector");

function buildUnityProject(entryFile, options = {}) {
  const project = inspectProject(entryFile);
  const outputDir = path.resolve(options.outputDir || path.join(path.dirname(entryFile), "build", "unity", "Assets", "MGLGenerated"));
  const generatedFiles = [];

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, "MglUnityBindings.cs"), renderBindingsSource(), "utf8");
  generatedFiles.push(path.join(outputDir, "MglUnityBindings.cs"));

  project.files.forEach((file) => {
    const classes = file.program.body.filter((statement) => statement.type === "ClassDeclaration");
    classes.forEach((classDeclaration) => {
      const destination = path.join(outputDir, `${classDeclaration.name.lexeme}.cs`);
      fs.writeFileSync(destination, transpileUnityClass(classDeclaration), "utf8");
      generatedFiles.push(destination);
    });
  });

  return {
    entryFile: path.resolve(entryFile),
    outputDir,
    generatedFiles,
  };
}

function renderUnityBuildReport(result) {
  return [
    `Unity output: ${result.outputDir}`,
    `Generated scripts: ${result.generatedFiles.length}`,
    ...result.generatedFiles.map((filePath) => `- ${filePath}`),
  ].join("\n");
}

function transpileUnityClass(classDeclaration) {
  const methods = classDeclaration.methods.map((method) => renderMethod(method)).join("\n\n");
  return [
    "using System;",
    "using System.Collections.Generic;",
    "using UnityEngine;",
    "",
    `public class ${classDeclaration.name.lexeme} : MonoBehaviour`,
    "{",
    indent(methods),
    "}",
    "",
  ].join("\n");
}

function renderMethod(method) {
  const methodName = mapMethodName(method.name.lexeme);
  const returnType = mapType(method.returnType);
  const parameters = method.params.map((param) => `${mapType(param.typeAnnotation)} ${param.name.lexeme}`).join(", ");
  const body = method.body.statements.map((statement) => renderStatement(statement)).join("\n");
  return `public ${returnType} ${methodName}(${parameters})\n{\n${indent(body || "// No-op")}\n}`;
}

function renderStatement(statement) {
  switch (statement.type) {
    case "VariableDeclaration":
      return `var ${statement.name.lexeme} = ${renderExpression(statement.initializer)};`;
    case "ExpressionStatement":
      return `${renderExpression(statement.expression)};`;
    case "ReturnStatement":
      return statement.value ? `return ${renderExpression(statement.value)};` : "return;";
    case "IfStatement": {
      const thenBody = statement.thenBranch.statements.map((item) => renderStatement(item)).join("\n");
      const elseBody = statement.elseBranch && statement.elseBranch.statements
        ? statement.elseBranch.statements.map((item) => renderStatement(item)).join("\n")
        : null;
      return [
        `if (${renderExpression(statement.condition)})`,
        "{",
        indent(thenBody || "// No-op"),
        "}",
        elseBody ? `else\n{\n${indent(elseBody || "// No-op")}\n}` : null,
      ].filter(Boolean).join("\n");
    }
    case "LoopStatement": {
      const iterator = statement.iterator.lexeme;
      const step = statement.step ? renderExpression(statement.step) : "1";
      const body = statement.body.statements.map((item) => renderStatement(item)).join("\n");
      return [
        `for (var ${iterator} = ${renderExpression(statement.start)}; ${iterator} <= ${renderExpression(statement.end)}; ${iterator} += ${step})`,
        "{",
        indent(body || "// No-op"),
        "}",
      ].join("\n");
    }
    default:
      return `// Unsupported statement: ${statement.type}`;
  }
}

function renderExpression(expression) {
  switch (expression.type) {
    case "Literal":
      return renderLiteral(expression.value);
    case "Identifier":
      return expression.name.lexeme === "self" ? "this" : expression.name.lexeme;
    case "GroupingExpression":
      return `(${renderExpression(expression.expression)})`;
    case "UnaryExpression":
      return `${expression.operator.lexeme}${renderExpression(expression.right)}`;
    case "BinaryExpression":
    case "LogicalExpression":
      return `${renderExpression(expression.left)} ${expression.operator.lexeme} ${renderExpression(expression.right)}`;
    case "AssignmentExpression":
      return `${renderExpression(expression.target)} = ${renderExpression(expression.value)}`;
    case "GetExpression":
      return `${renderExpression(expression.object)}.${expression.name.lexeme}`;
    case "IndexExpression":
      return `${renderExpression(expression.object)}[${renderExpression(expression.index)}]`;
    case "CallExpression":
      return renderCall(expression);
    case "ArrayExpression":
      return `new List<object> { ${expression.elements.map((item) => renderExpression(item)).join(", ")} }`;
    default:
      return "null";
  }
}

function renderCall(expression) {
  if (expression.callee.type === "Identifier" && expression.callee.name.lexeme === "print") {
    return `Debug.Log(${expression.args[0] ? renderExpression(expression.args[0]) : "\"\""})`;
  }

  if (expression.callee.type === "Identifier" && expression.callee.name.lexeme === "Vector3") {
    return `new Vector3(${expression.args.map((item) => renderExpression(item)).join(", ")})`;
  }

  return `${renderExpression(expression.callee)}(${expression.args.map((item) => renderExpression(item)).join(", ")})`;
}

function renderLiteral(value) {
  if (value === null) {
    return "null";
  }

  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  return String(value);
}

function mapMethodName(name) {
  if (name === "start") {
    return "Start";
  }

  if (name === "update") {
    return "Update";
  }

  if (name === "fixedUpdate") {
    return "FixedUpdate";
  }

  return name;
}

function mapType(typeAnnotation) {
  if (!typeAnnotation) {
    return "object";
  }

  if (typeAnnotation.type === "ArrayType") {
    return "List<object>";
  }

  switch (typeAnnotation.name.lexeme) {
    case "number":
      return "float";
    case "string":
      return "string";
    case "bool":
      return "bool";
    case "void":
      return "void";
    default:
      return typeAnnotation.name.lexeme;
  }
}

function indent(value) {
  return String(value)
    .split("\n")
    .map((line) => `    ${line}`)
    .join("\n");
}

function renderBindingsSource() {
  return [
    "using UnityEngine;",
    "",
    "public static class MglUnityBindings",
    "{",
    "    public static void Print(object value)",
    "    {",
    "        Debug.Log(value);",
    "    }",
    "}",
    "",
  ].join("\n");
}

module.exports = {
  buildUnityProject,
  renderUnityBuildReport,
};
