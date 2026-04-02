const fs = require("fs");
const path = require("path");

const DEFAULT_PROFILE = Object.freeze({
  runs: 0,
  patterns: {},
  intents: {},
  files: {},
  lastUpdatedAt: null,
});

function loadLearningProfile(rootDirectory) {
  const filePath = getLearningFilePath(rootDirectory);

  if (!fs.existsSync(filePath)) {
    return {
      filePath,
      profile: cloneDefaultProfile(),
    };
  }

  try {
    const profile = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return {
      filePath,
      profile: {
        ...cloneDefaultProfile(),
        ...profile,
        patterns: { ...DEFAULT_PROFILE.patterns, ...(profile.patterns || {}) },
        intents: { ...DEFAULT_PROFILE.intents, ...(profile.intents || {}) },
        files: { ...DEFAULT_PROFILE.files, ...(profile.files || {}) },
      },
    };
  } catch (_error) {
    return {
      filePath,
      profile: cloneDefaultProfile(),
    };
  }
}

function saveLearningProfile(filePath, profile) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
}

function recordLearning(profile, analysis) {
  const next = {
    ...cloneDefaultProfile(),
    ...profile,
    patterns: { ...(profile.patterns || {}) },
    intents: { ...(profile.intents || {}) },
    files: { ...(profile.files || {}) },
    runs: (profile.runs || 0) + 1,
    lastUpdatedAt: new Date().toISOString(),
  };

  analysis.suggestions.forEach((suggestion) => {
    next.patterns[suggestion.code] = (next.patterns[suggestion.code] || 0) + 1;
  });

  if (analysis.intent.goal) {
    next.intents[analysis.intent.goal] = (next.intents[analysis.intent.goal] || 0) + 1;
  }

  analysis.files.forEach((file) => {
    next.files[file.filePath] = {
      routes: file.server.routes.length,
      functions: file.functions.length,
      complexity: file.metrics.complexity,
      warnings: file.suggestions.length,
    };
  });

  return next;
}

function getLearningFilePath(rootDirectory) {
  return path.join(rootDirectory, ".mgl", "learning.json");
}

function cloneDefaultProfile() {
  return JSON.parse(JSON.stringify(DEFAULT_PROFILE));
}

module.exports = {
  getLearningFilePath,
  loadLearningProfile,
  recordLearning,
  saveLearningProfile,
};
