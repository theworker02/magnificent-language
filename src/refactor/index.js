function buildRefactorPlan(analysis) {
  const proposals = [];

  analysis.files.forEach((file) => {
    file.functions
      .filter((func) => func.complexity >= 16 || func.statementCount >= 12)
      .forEach((func) => {
        proposals.push({
          type: "split-function",
          code: "split_large_function",
          filePath: file.filePath,
          target: func.name,
          title: `Split '${func.name}' into helper functions`,
          detail: `The function has ${func.statementCount} statements and complexity ${func.complexity}. Extract loop or branch-heavy sections into focused helpers.`,
        });
      });

    file.variableNames
      .filter((variable) => variable.suggestedName && variable.suggestedName !== variable.name)
      .forEach((variable) => {
        proposals.push({
          type: "rename-variable",
          code: "rename_variable",
          filePath: file.filePath,
          target: variable.name,
          title: `Rename '${variable.name}' to '${variable.suggestedName}'`,
          detail: variable.reason,
        });
      });

    if (file.server.routes.length >= 4) {
      proposals.push({
        type: "extract-routes",
        code: "extract_route_modules",
        filePath: file.filePath,
        target: "server",
        title: "Extract route groups into modules",
        detail: `This file defines ${file.server.routes.length} routes. Split related endpoints into imported modules to reduce routing concentration.`,
      });
    }
  });

  return proposals;
}

function renderRefactorPlan(plan, rootDirectory) {
  const lines = [
    "Refactor Plan",
    "",
  ];

  if (plan.length === 0) {
    lines.push("No high-confidence refactor proposals found.");
    return lines.join("\n");
  }

  plan.forEach((proposal, index) => {
    lines.push(`${index + 1}. ${proposal.title}`);
    lines.push(`   File: ${shortPath(rootDirectory, proposal.filePath)}`);
    lines.push(`   Detail: ${proposal.detail}`);
  });

  return lines.join("\n");
}

function shortPath(rootDirectory, filePath) {
  return filePath.startsWith(rootDirectory)
    ? filePath.slice(rootDirectory.length + 1)
    : filePath;
}

module.exports = {
  buildRefactorPlan,
  renderRefactorPlan,
};
