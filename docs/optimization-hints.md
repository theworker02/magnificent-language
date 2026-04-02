# Optimization Hints

Use:

```mgl
print(optimize(value))
```

Or from the CLI:

```bash
mgl memory examples/main.mgl
```

Current hints include cases such as:

- large arrays that may benefit from reuse
- values retained by many owners
- frequently mutated tracked values
- closures that retain multiple captured bindings
- duplicate tracked strings
