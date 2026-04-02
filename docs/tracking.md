# Tracking

## Explicit Tracking

```mgl
let items = track [1, 2, 3]
let name = track "Magnificent"
```

Explicit tracking is the clearest way to request memory metadata for a value.

## Tracking Record Types

```mgl
type Inventory {
  items: array<string>
  owner: string
}

let inv = track Inventory {
  items: ["rope", "torch"],
  owner: "camp"
}
```

## Inspection

```mgl
print(memoryOf(inv))
print(ownerOf(inv))
print(refsOf(inv))
print(sizeOf(inv))
print(isTracked(inv))
print(whyAlive(inv))
```
