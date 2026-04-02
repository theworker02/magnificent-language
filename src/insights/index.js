function renderAnalyzeReport(analysis) {
  const lines = [
    `MGL Analyze: ${shortPath(analysis.rootDirectory, analysis.entryFile)}`,
    "",
    "Detected Patterns",
  ];

  analysis.patterns.forEach((pattern) => {
    lines.push(`- ${pattern}`);
  });

  if (analysis.patterns.length === 0) {
    lines.push("- No major architecture patterns detected.");
  }

  lines.push("");
  lines.push("Suggestions");
  if (analysis.suggestions.length === 0) {
    lines.push("- No high-priority suggestions.");
  } else {
    analysis.suggestions.forEach((suggestion) => {
      lines.push(`- ${suggestion.message}`);
      lines.push(`  ${shortPath(analysis.rootDirectory, suggestion.filePath)}:${suggestion.line}`);
    });
  }

  return lines.join("\n");
}

function renderImproveReport(analysis) {
  const lines = [
    `MGL Improve: ${shortPath(analysis.rootDirectory, analysis.entryFile)}`,
    "",
    "Priority Improvements",
  ];

  if (analysis.suggestions.length === 0) {
    lines.push("- No urgent improvements detected.");
  } else {
    analysis.suggestions.slice(0, 8).forEach((suggestion, index) => {
      lines.push(`${index + 1}. ${suggestion.message}`);
      lines.push(`   Why: ${suggestion.why}`);
      lines.push(`   File: ${shortPath(analysis.rootDirectory, suggestion.filePath)}:${suggestion.line}`);
    });
  }

  return lines.join("\n");
}

function renderExplainReport(analysis) {
  const lines = [
    `MGL Explain: ${shortPath(analysis.rootDirectory, analysis.entryFile)}`,
    "",
    "What The Code Does",
  ];

  analysis.explanation.summary.forEach((line) => {
    lines.push(`- ${line}`);
  });

  lines.push("");
  lines.push("Data Flow");
  analysis.explanation.dataFlow.forEach((line) => {
    lines.push(`- ${line}`);
  });

  return lines.join("\n");
}

function renderPerformanceReport(analysis) {
  const lines = [
    `MGL Performance: ${shortPath(analysis.rootDirectory, analysis.entryFile)}`,
    "",
    "Performance Insights",
  ];

  if (analysis.performance.length === 0) {
    lines.push("- No obvious performance hotspots detected.");
  } else {
    analysis.performance.forEach((item) => {
      lines.push(`- ${item.message}`);
      lines.push(`  ${shortPath(analysis.rootDirectory, item.filePath)}:${item.line}`);
    });
  }

  lines.push("");
  lines.push("Memory Insights");
  if (analysis.memoryInsights.length === 0) {
    lines.push("- No memory-pressure patterns detected.");
  } else {
    analysis.memoryInsights.forEach((item) => {
      lines.push(`- ${item.message}`);
      lines.push(`  ${shortPath(analysis.rootDirectory, item.filePath)}:${item.line}`);
    });
  }

  return lines.join("\n");
}

function renderHealthReport(analysis) {
  const lines = [
    `MGL Health: ${shortPath(analysis.rootDirectory, analysis.entryFile)}`,
    "",
    `Complexity score: ${analysis.health.complexity}/100`,
    `Maintainability score: ${analysis.health.maintainability}/100`,
    `Performance score: ${analysis.health.performance}/100`,
    `Memory efficiency score: ${analysis.health.memory}/100`,
    "",
    `Overall: ${analysis.health.overall}/100`,
  ];

  if (analysis.learningNote) {
    lines.push("");
    lines.push(`Learning: ${analysis.learningNote}`);
  }

  return lines.join("\n");
}

function shortPath(rootDirectory, filePath) {
  return filePath.startsWith(rootDirectory)
    ? filePath.slice(rootDirectory.length + 1)
    : filePath;
}

module.exports = {
  renderAnalyzeReport,
  renderExplainReport,
  renderHealthReport,
  renderImproveReport,
  renderPerformanceReport,
};
