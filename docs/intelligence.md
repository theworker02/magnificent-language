# Intelligent Language System

Magnificent Language 1.6.0 keeps the Intelligent Language System as a core capability and integrates it with prediction, memory intelligence, and systems tooling.

## Intent

Declare the kind of software you are trying to build:

```mgl
intent {
  goal: "build scalable api"
  priority: "performance"
}
```

The analyzer uses this metadata to rank performance and architecture guidance.

## Learning Mode

```mgl
learn {
  trackPatterns: true
}
```

When learning is enabled, MGL records recurring analysis patterns in `.mgl/learning.json` so later runs can point out repeated issues.

## Commands

```bash
mgl analyze examples/intelligence-demo.mgl --graph
mgl improve examples/intelligence-demo.mgl
mgl explain examples/api-server.mgl
mgl performance examples/intelligence-demo.mgl
mgl refactor examples/intelligence-demo.mgl
mgl health examples/intelligence-demo.mgl
```

## What It Detects

- monolithic route structures
- large functions
- tight coupling
- poor modularization
- allocations inside loops
- async functions without awaits
- tracked values that may increase memory pressure
