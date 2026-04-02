const path = require("path");

const { inspectProject } = require("../tooling/inspector");
const { computeConfidence } = require("./confidence");
const { analyzePrediction } = require("./analyzer");
const { renderPredictionReport } = require("./reporter");
const { PredictiveSimulator } = require("./simulator");

function predictProject(entryFile, options = {}) {
  const project = inspectProject(entryFile);
  const fileMap = new Map(project.files.map((file) => [file.filePath, file]));
  const context = {
    entryFile: path.resolve(entryFile),
    fileMap,
    maxPaths: options.maxPaths || 50,
    maxLoopIterations: options.maxLoopIterations || 20,
    framesToSimulate: options.framesToSimulate || 5,
    gameMode: options.gameMode || false,
  };
  const simulator = new PredictiveSimulator(context);
  const states = simulator.simulate(context.entryFile);
  const analysis = analyzePrediction(states, context);
  const confidence = computeConfidence(states, context);

  return {
    entryFile: context.entryFile,
    fileLabel: path.basename(context.entryFile),
    states,
    analysis,
    confidence,
  };
}

module.exports = {
  predictProject,
  renderPredictionReport,
};
