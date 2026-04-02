const fs = require("fs");
const path = require("path");

const inspector = require("../../tooling/inspector");
const { discoverRustImports } = require("../../runtime/rust");

function buildNativeBundle(entryFile, options = {}) {
  const project = inspector.inspectProject(entryFile);
  const absoluteEntry = path.resolve(entryFile);
  const files = new Set(project.files.map((file) => file.filePath));
  discoverRustImports(absoluteEntry, inspector).forEach((filePath) => files.add(filePath));

  const commonRoot = findCommonRoot(Array.from(files).concat([absoluteEntry]));
  const bundleRoot = path.resolve(options.outputDir || path.join(commonRoot, "build", "native", path.basename(absoluteEntry, path.extname(absoluteEntry))));
  const appRoot = path.join(bundleRoot, "app");
  const executablePath = path.join(bundleRoot, process.platform === "win32" ? "run.cmd" : path.basename(absoluteEntry, path.extname(absoluteEntry)));
  const repoRoot = path.resolve(__dirname, "../../..");

  fs.mkdirSync(appRoot, { recursive: true });

  Array.from(files).forEach((filePath) => {
    const relativePath = path.relative(commonRoot, filePath);
    const destination = path.join(appRoot, relativePath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(filePath, destination);
  });

  const relativeEntry = path.relative(commonRoot, absoluteEntry);
  if (process.platform === "win32") {
    fs.writeFileSync(
      executablePath,
      [
        "@echo off",
        `node "${path.join(repoRoot, "bin", "mgl")}" run "%~dp0app\\${relativeEntry.replace(/\//g, "\\")}" %*`,
        "",
      ].join("\r\n"),
      "utf8",
    );
  } else {
    fs.writeFileSync(
      executablePath,
      [
        "#!/usr/bin/env bash",
        "set -euo pipefail",
        'SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"',
        `node "${path.join(repoRoot, "bin", "mgl")}" run "$SCRIPT_DIR/app/${relativeEntry}" "$@"`,
        "",
      ].join("\n"),
      "utf8",
    );
    fs.chmodSync(executablePath, 0o755);
  }

  return {
    bundleRoot,
    executablePath,
    files: Array.from(files),
  };
}

function renderNativeBuildReport(result) {
  return [
    `Native bundle: ${result.bundleRoot}`,
    `Executable: ${result.executablePath}`,
    `Files copied: ${result.files.length}`,
  ].join("\n");
}

function findCommonRoot(filePaths) {
  const segments = filePaths
    .map((filePath) => path.resolve(filePath).split(path.sep))
    .filter((parts) => parts.length > 0);

  if (segments.length === 0) {
    return process.cwd();
  }

  const first = segments[0];
  let sharedLength = first.length;

  for (const parts of segments.slice(1)) {
    sharedLength = Math.min(sharedLength, parts.length);
    for (let index = 0; index < sharedLength; index += 1) {
      if (parts[index] !== first[index]) {
        sharedLength = index;
        break;
      }
    }
  }

  if (sharedLength === 0) {
    return path.dirname(path.resolve(filePaths[0]));
  }

  return first.slice(0, sharedLength).join(path.sep) || path.sep;
}

module.exports = {
  buildNativeBundle,
  renderNativeBuildReport,
};
