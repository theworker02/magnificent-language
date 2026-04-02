function capStates(states, maxPaths) {
  if (states.length <= maxPaths) {
    return states;
  }

  return states.slice(0, maxPaths).map((state) => {
    const next = state.clone();
    next.warn(`Prediction path limit reached. Truncated to ${maxPaths} paths.`);
    next.confidencePenalty += 8;
    return next;
  });
}

module.exports = {
  capStates,
};
