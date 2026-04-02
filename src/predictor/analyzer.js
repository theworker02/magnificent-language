const { stringifyPredictiveValue } = require("./state-tracker");

function analyzePrediction(states, context = {}) {
  const predictedOutputs = dedupe(states.map((state) => state.outputs.join("\n")).filter(Boolean));
  const warnings = dedupeMessages(states.flatMap((state) => state.warnings));
  const errors = dedupeMessages(states.flatMap((state) => state.errors));
  const totalOperations = Math.max(...states.map((state) => state.metrics.operations), 0);
  const totalAllocations = Math.max(...states.map((state) => state.metrics.allocations), 0);
  const trackedAllocations = Math.max(...states.map((state) => state.metrics.trackedAllocations), 0);
  const perFrameOperations = Math.max(...states.map((state) => state.metrics.perFrameOperations), 0);
  const perFrameAllocations = Math.max(...states.map((state) => state.metrics.perFrameAllocations), 0);

  return {
    predictedOutputs,
    possibleOutcomes: predictedOutputs.length > 0 ? predictedOutputs : ["No user-visible output predicted."],
    warnings,
    errors,
    performance: {
      label: classifyPerformance(totalOperations, perFrameOperations, context.gameMode),
      totalOperations,
      perFrameOperations,
      asyncOps: Math.max(...states.map((state) => state.metrics.asyncOps), 0),
      loops: Math.max(...states.map((state) => state.metrics.loops), 0),
    },
    memory: {
      label: classifyMemory(totalAllocations, trackedAllocations, perFrameAllocations),
      allocations: totalAllocations,
      trackedAllocations,
      perFrameAllocations,
      possibleLeaks: Math.max(...states.map((state) => state.metrics.possibleLeaks), 0),
    },
    game: context.gameMode
      ? {
        framesSimulated: context.framesToSimulate,
        objectStates: dedupe(states.flatMap((state) => state.gameObjects.map((value) => stringifyPredictiveValue(value)))),
      }
      : null,
  };
}

function classifyPerformance(totalOperations, perFrameOperations, gameMode) {
  if (gameMode) {
    if (perFrameOperations >= 40) {
      return "high";
    }
    if (perFrameOperations >= 18) {
      return "medium";
    }
    return "low";
  }

  if (totalOperations >= 80) {
    return "high";
  }
  if (totalOperations >= 30) {
    return "medium";
  }
  return "low";
}

function classifyMemory(totalAllocations, trackedAllocations, perFrameAllocations) {
  if (perFrameAllocations >= 5 || trackedAllocations >= 6 || totalAllocations >= 15) {
    return "high";
  }
  if (perFrameAllocations >= 2 || trackedAllocations >= 2 || totalAllocations >= 6) {
    return "medium";
  }
  return "low";
}

function dedupe(values) {
  return Array.from(new Set(values));
}

function dedupeMessages(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.message}:${item.filePath || ""}:${item.line || ""}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

module.exports = {
  analyzePrediction,
};
