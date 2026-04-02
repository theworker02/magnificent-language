# Snapshots

Capture memory state:

```mgl
let before = snapshotMemory("before")
let data = track range(1, 5)
let after = snapshotMemory("after")

print(compareMemory(before, after))
```

Snapshot comparisons report:

- allocation delta
- released allocation delta
- total tracked size delta
- type distribution changes
