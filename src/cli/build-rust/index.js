const path = require("path");

const inspector = require("../../tooling/inspector");
const { compileRustModule, discoverRustImports } = require("../../runtime/rust");

function buildRustArtifacts(targetPath, options = {}) {
  const absolutePath = path.resolve(targetPath);
  const rustModules = absolutePath.endsWith(".rs")
    ? [absolutePath]
    : discoverRustImports(absolutePath, inspector);
  const projectRoot = options.projectRoot || path.dirname(absolutePath);
  const builds = rustModules.map((modulePath) => compileRustModule(modulePath, { projectRoot }));

  return {
    entryFile: absolutePath,
    builds,
  };
}

function renderRustBuildReport(report) {
  const lines = [
    `Rust build targets: ${report.builds.length}`,
  ];

  report.builds.forEach((build) => {
    lines.push(`- ${build.moduleName}: ${build.libraryPath}`);
    lines.push(`  bridge: ${build.bridgePath}`);
    lines.push(`  exports: ${build.functions.map((fn) => fn.name).join(", ")}`);
  });

  return lines.join("\n");
}

module.exports = {
  buildRustArtifacts,
  renderRustBuildReport,
};
