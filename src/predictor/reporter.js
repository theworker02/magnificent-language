function renderPredictionReport(prediction) {
  const lines = [
    `MGL Predict: ${prediction.fileLabel}`,
    "",
    "Predicted Output",
  ];

  if (prediction.analysis.predictedOutputs.length === 0) {
    lines.push("- No deterministic output predicted.");
  } else {
    prediction.analysis.predictedOutputs.forEach((output) => {
      lines.push(`- ${singleLine(output)}`);
    });
  }

  lines.push("");
  lines.push("Possible Outcomes");
  prediction.analysis.possibleOutcomes.forEach((outcome) => {
    lines.push(`- ${singleLine(outcome)}`);
  });

  lines.push("");
  lines.push("Warnings");
  if (prediction.analysis.warnings.length === 0) {
    lines.push("- None");
  } else {
    prediction.analysis.warnings.forEach((warning) => {
      lines.push(`- ${warning.message}`);
    });
  }

  lines.push("");
  lines.push("Errors");
  if (prediction.analysis.errors.length === 0) {
    lines.push("- None");
  } else {
    prediction.analysis.errors.forEach((error) => {
      lines.push(`- ${error.message}`);
    });
  }

  lines.push("");
  lines.push("Performance Estimate");
  lines.push(`- ${prediction.analysis.performance.label.toUpperCase()} (${prediction.analysis.performance.totalOperations} operations, ${prediction.analysis.performance.loops} loop(s), ${prediction.analysis.performance.asyncOps} async op(s))`);

  lines.push("");
  lines.push("Memory Estimate");
  lines.push(`- ${prediction.analysis.memory.label.toUpperCase()} (${prediction.analysis.memory.allocations} allocations, ${prediction.analysis.memory.trackedAllocations} tracked, ${prediction.analysis.memory.perFrameAllocations} per-frame)`);

  if (prediction.analysis.game) {
    lines.push("");
    lines.push("Game Forecast");
    lines.push(`- Frames simulated: ${prediction.analysis.game.framesSimulated}`);
    prediction.analysis.game.objectStates.forEach((state) => {
      lines.push(`- Object state: ${singleLine(state)}`);
    });
  }

  lines.push("");
  lines.push(`Confidence: ${prediction.confidence}%`);

  return lines.join("\n");
}

function singleLine(text) {
  return String(text).replace(/\s*\n+\s*/g, " | ");
}

module.exports = {
  renderPredictionReport,
};
