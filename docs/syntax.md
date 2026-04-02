# MGL Syntax Reference

## Variables

```mgl
let name: string = "Ada"
let scores: array<number> = [4, 8, 15]
```

## Functions

```mgl
func add(a: number, b: number): number {
  return a + b
}
```

Async functions:

```mgl
func fetchName(): string async {
  await sleep(10)
  return "Matt"
}
```

## Intent And Learning

```mgl
intent {
  goal: "build scalable api"
  priority: "performance"
}

learn {
  trackPatterns: true
}
```

## Classes

```mgl
class Car {
  func init(name: string) {
    self.name = name
  }
}
```

## Record Types

```mgl
type User {
  name: string
  age: number
}
```

Instantiate a record type:

```mgl
let user = User {
  name: "Matt",
  age: 23
}
```

## Object Literals

```mgl
let payload = {
  name: "cache",
  hits: 3
}
```

## Modules

```mgl
export func add(a: number, b: number): number {
  return a + b
}
```

```mgl
import "./modules/math.mgl" as math
print(math.add(2, 3))
```

## Memory Tracking

Track a value directly:

```mgl
let items = track [1, 2, 3]
```

Or use the built-in form:

```mgl
let items = track([1, 2, 3])
```

## Memory Statements

```mgl
inspect items
memory items
whyalive items
optimize items
```

## Memory Built-Ins

- `memoryOf(value)`
- `ownerOf(value)`
- `refsOf(value)`
- `sizeOf(value)`
- `isTracked(value)`
- `whyAlive(value)`
- `traceAllocations()`
- `snapshotMemory(name?)`
- `compareMemory(before, after)`
- `watchMemory(value, label?)`
- `optimize(value)`

## Loops

```mgl
loop i from 0 to 3 {
  print(i)
}
```

Forever loop:

```mgl
loop {
  await sleep(1000)
}
```

## Arrays

```mgl
let values: array<number> = [1, 2, 3]
push(values, 4)
values[1] = 99
```

## Server Blocks

```mgl
server {
  middleware {
    response.header("x-powered-by", "mgl")
  }

  route "/" {
    return "Hello World"
  }

  route "/api/users" method "POST" {
    return json({
      ok: true
    })
  }
}
```

## Tasks

```mgl
task cleanup {
  await sleep(10)
  print("done")
}
```

## Tests

```mgl
test "addition works" {
  assert(2 + 3 == 5)
}
```
