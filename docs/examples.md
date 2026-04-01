# MGL Examples

## Hello World

```mgl
print("Hello from MGL")
```

## Summation Loop

```mgl
let total = 0

loop i from 1 to 5 {
  total = total + i
}

print("Total: " + total)
```

## Functions

```mgl
func square(x) {
  return x * x
}

print(square(9))
```

## Classes

```mgl
class Car {
  func init(name) {
    self.name = name
  }

  func drive() {
    print(self.name + " is driving")
  }
}

let car = Car("Comet")
car.drive()
```

## Imports

```mgl
import "./modules/math.mgl"

print(math.add(2, 3))
```

## Arrays

```mgl
let items = ["one", "two"]
push(items, "three")
print(length(items))
print(items)
```

## Included Example Programs

- `examples/hello.mgl` demonstrates literals, function calls, and string concatenation.
- `examples/loops.mgl` demonstrates ranges, numeric arithmetic, conditionals, and loop scope.
- `examples/classes.mgl` demonstrates classes, constructors, fields, methods, and return values.
- `examples/imports.mgl` demonstrates modules, namespaces, arrays, and standard-library helpers.
