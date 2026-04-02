const { loadLearningProfile, recordLearning, saveLearningProfile } = require("./learning");

function prepareIntelligenceContext(options = {}) {
  const config = options.config || {};
  const files = options.files || [];
  const declaredIntent = mergeMetadataBlocks(files.flatMap((file) => file.intents || []));
  const declaredLearning = mergeMetadataBlocks(files.flatMap((file) => file.learnBlocks || []));
  const intelligenceConfig = {
    enabled: config.intelligence?.enabled ?? true,
    learning: config.intelligence?.learning ?? true,
    strictAnalysis: config.intelligence?.strictAnalysis ?? false,
  };
  const trackingEnabled = intelligenceConfig.learning || declaredLearning.trackPatterns === true;
  const learning = trackingEnabled
    ? loadLearningProfile(options.rootDirectory || process.cwd())
    : { filePath: null, profile: null };

  return {
    intent: declaredIntent,
    learn: declaredLearning,
    intelligenceConfig,
    learningFilePath: learning.filePath,
    learningProfile: learning.profile,
    trackingEnabled,
  };
}

function finalizeLearning(context, analysis) {
  if (!context.trackingEnabled || !context.learningFilePath || !context.learningProfile) {
    return null;
  }

  const nextProfile = recordLearning(context.learningProfile, analysis);
  saveLearningProfile(context.learningFilePath, nextProfile);
  return nextProfile;
}

function mergeMetadataBlocks(blocks) {
  return blocks.reduce((merged, block) => ({ ...merged, ...(block.values || {}) }), {});
}

module.exports = {
  finalizeLearning,
  mergeMetadataBlocks,
  prepareIntelligenceContext,
};
