const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function findRustBinary(name) {
  if (probeBinary(name)) {
    return name;
  }

  for (const candidate of candidatePaths(name)) {
    if (probeBinary(candidate)) {
      return candidate;
    }
  }

  return null;
}

function probeBinary(binaryPath) {
  const result = spawnSync(binaryPath, ["--version"], {
    encoding: "utf8",
  });
  return result.status === 0 && Boolean((result.stdout || result.stderr || "").trim());
}

function candidatePaths(name) {
  const names = process.platform === "win32" ? [name, `${name}.exe`] : [name];
  const roots = [
    process.env.CARGO_HOME,
    process.env.HOME ? path.join(process.env.HOME, ".cargo") : null,
    process.env.USERPROFILE ? path.join(process.env.USERPROFILE, ".cargo") : null,
  ].filter(Boolean);

  const candidates = [];
  roots.forEach((root) => {
    names.forEach((binaryName) => {
      const candidate = path.join(root, "bin", binaryName);
      if (fs.existsSync(candidate)) {
        candidates.push(candidate);
      }
    });
  });

  return candidates;
}

module.exports = {
  findRustBinary,
};
