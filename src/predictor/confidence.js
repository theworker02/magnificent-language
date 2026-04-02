function computeConfidence(states, context = {}) {
  if (states.length === 0) {
    return 20;
  }

  const penalties = states.map((state) => (
    state.confidencePenalty
      + state.metrics.unsupported * 6
      + state.metrics.truncatedLoops * 4
      + state.metrics.branches * 2
      + state.errors.length * 8
  ));
  const averagePenalty = penalties.reduce((total, value) => total + value, 0) / penalties.length;
  const uncertaintyPenalty = Math.max(0, states.length - 1) * 5;
  const gamePenalty = context.gameMode ? 4 : 0;
  return Math.max(15, Math.min(99, Math.round(100 - averagePenalty - uncertaintyPenalty - gamePenalty)));
}

module.exports = {
  computeConfidence,
};
