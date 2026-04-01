# MGL Syntax Reference

## Comments

Use `//` for line comments.

```mgl
// This is a comment
```

## Variables

Declare variables with `let`.

```mgl
let count = 10
let name = "Ada"
let empty = null
```

Variables can be reassigned:

```mgl
count = count + 1
```

## Imports

Use `import` with a string path to load another MGL file. The imported module is exposed as a namespace based on the file name.

```mgl
import "./modules/math.mgl"

print(math.add(1, 2))
```

## Functions

Functions are declared with `func`.

```mgl
func add(a, b) {
  return a + b
}

print(add(2, 3))
```

## Conditionals

Conditionals support `if`, `else if`, and `else`.

```mgl
if score > 90 {
  print("Excellent")
} else if score > 70 {
  print("Good")
} else {
  print("Keep going")
}
```

## Loops

`loop` iterates over a numeric range. The `to` bound is inclusive.

```mgl
loop i from 0 to 3 {
  print(i)
}
```

You can also specify a step:

```mgl
loop i from 10 to 0 step -2 {
  print(i)
}
```

## Classes

Classes group methods and are instantiated by calling the class name.

```mgl
class Counter {
  func init(start) {
    self.value = start
  }

  func increment() {
    self.value = self.value + 1
    return self.value
  }
}

let counter = Counter(5)
print(counter.increment())
```

`init` is treated as the constructor.

## Expressions

Supported operators:

- Arithmetic: `+`, `-`, `*`, `/`, `%`
- Comparison: `>`, `>=`, `<`, `<=`, `==`, `!=`
- Logical: `and`, `or`, `!`

`+` adds numbers and concatenates strings. If either operand is a string, MGL converts both sides to text.

## Arrays

Arrays use square-bracket literals.

```mgl
let values = [1, 2, 3]
push(values, 4)
print(length(values))
```

Access elements by index:

```mgl
print(values[0])
values[1] = 99
```

## Blocks

Blocks use braces:

```mgl
func greet(name) {
  print("Hello, " + name)
}
```

## Standard Library

Built-in functions available in every program:

- `print(...)` writes values to standard output.
- `input(prompt)` reads one line from standard input.
- `length(value)` returns the length of a string or array.
- `push(array, value)` appends to an array and returns the new length.
- `readFile(path)` reads a UTF-8 text file.
- `writeFile(path, data)` writes UTF-8 text to a file.
- `random()` returns a pseudorandom number between 0 and 1.
- `clock()` returns the current Unix time in seconds.
- `len(value)` is a compatibility alias for `length(value)`.
- `type(value)` returns a human-readable type name.
- `str(value)` converts a value to text.
- `num(value)` converts a value to a number.
