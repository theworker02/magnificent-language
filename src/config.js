const fs = require("fs");
const path = require("path");

const DEFAULT_CONFIG = Object.freeze({
  entry: "main.mgl",
  mode: "script",
  port: 3000,
  watch: false,
  strictTypes: false,
  optimize: false,
  memoryMode: "balanced",
  trackAllocations: false,
  memoryWarnings: false,
  snapshotOnExit: false,
  explainOwnership: true,
  intelligence: {
    enabled: true,
    learning: true,
    strictAnalysis: false,
  },
  predict: {
    enabled: true,
    maxPaths: 50,
    maxLoopIterations: 20,
    framesToSimulate: 5,
  },
  unity: {
    enabled: true,
    mode: "transpile",
    hotReload: false,
    outputDir: "build/unity",
  },
  sandbox: {
    enabled: false,
    allowExec: true,
    allowRust: true,
  },
});

function loadMglConfig(options = {}) {
  const startPath = options.startPath || options.filePath || process.cwd();
  const startDirectory = fs.existsSync(startPath) && fs.statSync(startPath).isDirectory()
    ? startPath
    : path.dirname(startPath);
  const configPath = findConfigPath(startDirectory);

  if (!configPath) {
    return {
      config: mergeConfig(DEFAULT_CONFIG, options.overrides || {}),
      configPath: null,
      rootDirectory: startDirectory,
    };
  }

  const rawConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
  return {
    config: mergeConfig(DEFAULT_CONFIG, rawConfig, options.overrides || {}),
    configPath,
    rootDirectory: path.dirname(configPath),
  };
}

function resolveEntryFile(inputPath, options = {}) {
  if (inputPath) {
    return path.resolve(options.cwd || process.cwd(), inputPath);
  }

  const loaded = loadMglConfig({ startPath: options.cwd || process.cwd() });
  return path.resolve(loaded.rootDirectory, loaded.config.entry);
}

function findConfigPath(startDirectory) {
  let current = path.resolve(startDirectory);

  while (true) {
    const candidate = path.join(current, "mgl.config.json");
    if (fs.existsSync(candidate)) {
      return candidate;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }

    current = parent;
  }
}

function mergeConfig(...configs) {
  return configs.reduce((merged, config) => {
    if (!config) {
      return merged;
    }

    return {
      ...merged,
      ...config,
      intelligence: {
        ...(merged.intelligence || {}),
        ...(config.intelligence || {}),
      },
      predict: {
        ...(merged.predict || {}),
        ...(config.predict || {}),
      },
      unity: {
        ...(merged.unity || {}),
        ...(config.unity || {}),
      },
      sandbox: {
        ...(merged.sandbox || {}),
        ...(config.sandbox || {}),
      },
    };
  }, {});
}

module.exports = {
  DEFAULT_CONFIG,
  loadMglConfig,
  mergeConfig,
  resolveEntryFile,
};
