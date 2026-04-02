# CLI Memory Tools

## Summary

```bash
mgl memory examples/main.mgl
```

Runs the program and prints:

- total tracked allocations
- total tracked size
- largest allocations
- optimization hints

## Live Allocations

```bash
mgl memory --live examples/main.mgl
```

## Ownership Graph

```bash
mgl memory --graph examples/main.mgl
```

## Leak-Style Report

```bash
mgl memory --leaks examples/main.mgl
```

The leak-style report highlights long-lived or multiply retained allocations.
