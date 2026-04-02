function renderArchitectureGraph(analysis) {
  const lines = [
    "Architecture Graph",
    "",
  ];

  analysis.files.forEach((file) => {
    lines.push(shortPath(analysis.rootDirectory, file.filePath));
    if (file.imports.length === 0) {
      lines.push("  -> no module imports");
    } else {
      file.imports.forEach((edge) => {
        lines.push(`  -> ${edge.specifier} (${shortPath(analysis.rootDirectory, edge.resolvedPath)})`);
      });
    }

    if (file.server.routes.length > 0) {
      file.server.routes.forEach((route) => {
        lines.push(`  => route ${route.method} ${route.path}`);
      });
    }

    file.tasks.forEach((task) => {
      lines.push(`  => task ${task.name}`);
    });
  });

  return lines.join("\n");
}

function renderDependencyGraph(analysis) {
  const lines = [
    "Module Dependencies",
    "",
  ];

  analysis.graph.dependencies.forEach((dependency) => {
    lines.push(`${shortPath(analysis.rootDirectory, dependency.from)} -> ${shortPath(analysis.rootDirectory, dependency.to)}`);
  });

  if (analysis.graph.dependencies.length === 0) {
    lines.push("No imports detected.");
  }

  return lines.join("\n");
}

function shortPath(rootDirectory, filePath) {
  return filePath.startsWith(rootDirectory)
    ? filePath.slice(rootDirectory.length + 1)
    : filePath;
}

module.exports = {
  renderArchitectureGraph,
  renderDependencyGraph,
};
