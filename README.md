![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Build](https://img.shields.io/badge/build-passing-brightgreen)
![Language](https://img.shields.io/badge/lang-MGL-purple)

# Magnificent Language

Magnificent Language, or MGL, is a readable, batteries-included interpreted language designed to feel structured like C++ while staying approachable like Python. This repository ships a real lexer, AST parser, tree-walking interpreter, import-capable runtime, interactive REPL, command-line runner, examples, documentation, and GitHub-ready project scaffolding.

It also includes a VS Code extension subproject in `mgl-extension/` for `.mgl` syntax highlighting, snippets, and CLI-powered editor commands.

## Why MGL?

MGL focuses on developer experience without giving up important language building blocks:

- Clean variable declarations with `let`
- Named functions with explicit parameters and `return`
- Straightforward conditionals and loops
- Class-based object modeling with instance methods
- Module imports with automatic namespace binding
- Interactive REPL for experimentation
- Built-in standard library functions for output, input, type inspection, conversion, file I/O, arrays, and time
- Zero-semicolon syntax with braces for clear structure

## Quick Start

1. Install Node.js 18 or newer.
2. Install project dependencies:

```bash
npm install
```

3. Install the CLI into your shell:

```bash
npm link
```

4. Run a program:

```bash
mgl run examples/hello.mgl
```

5. Start the interactive shell:

```bash
mgl repl
```

You can also run without linking:

```bash
node bin/mgl run examples/hello.mgl
```

## CLI

```bash
mgl help
mgl version
mgl run examples/classes.mgl
mgl run examples/imports.mgl
mgl repl
mgl init demo-app
```

## Example

```mgl
class Car {
  func init(name) {
    self.name = name
  }

  func drive() {
    print(self.name + " is driving")
  }
}

let car = Car("Roadster")
car.drive()
```

## Language Highlights

- Statements are separated by newlines or semicolons.
- Blocks use braces.
- Modules load with `import "path/to/module.mgl"`.
- `loop` supports `from`, `to`, and optional `step`.
- Classes are callable and instantiate objects.
- `init` acts as the constructor.
- `self` refers to the current instance inside methods.
- Arrays are available with literal syntax such as `[1, 2, 3]`.

## Modules

Imports bind a namespace using the imported filename:

```mgl
import "./modules/math.mgl"

print(math.add(2, 3))
```

Modules are cached per runtime session, so repeated imports do not execute the same file twice.

## REPL

Run:

```bash
mgl repl
```

The REPL preserves variables and functions between entries, supports multi-line blocks, and prints expression results automatically.

## VS Code Extension

The repository includes a first-party VS Code extension in `mgl-extension/`.

Features:

- `.mgl` file recognition
- Syntax highlighting
- Snippets for common constructs
- Comment/bracket configuration
- `MGL: Run Current File`
- `MGL: Open REPL`

To try it locally:

1. Open [mgl-extension/README.md](mgl-extension/README.md).
2. Open the repository root in VS Code.
3. Press `F5` to launch an Extension Development Host.

## GitHub Release

Release guidance lives in [docs/github-release.md](docs/github-release.md).

Typical flow:

1. Run `npm install` and `npm test`.
2. Bump versions in the root [package.json](package.json) and [mgl-extension/package.json](mgl-extension/package.json).
3. Package the extension from `mgl-extension/`.
4. Create a GitHub release and attach the generated `.vsix` file instead of committing it.

## Standard Library

The standard library includes:

- `print(...)`
- `input(prompt)`
- `length(value)`
- `push(array, value)`
- `readFile(path)`
- `writeFile(path, data)`
- `random()`
- `clock()`
- `len(value)`
- `type(value)`
- `str(value)`
- `num(value)`

## Project Structure

```text
magnificent-language/
├── .github/workflows/ci.yml
├── LICENSE
├── README.md
├── mgl-extension/
│   ├── LICENSE
│   ├── README.md
│   ├── extension.js
│   ├── language-configuration.json
│   ├── mgl-extension-icon.png
│   ├── package.json
│   └── syntaxes/
│       └── mgl.tmLanguage.json
├── package.json
├── bin/
│   └── mgl
├── docs/
│   ├── README.md
│   ├── examples.md
│   ├── getting-started.md
│   └── syntax.md
├── examples/
│   ├── classes.mgl
│   ├── hello.mgl
│   ├── imports.mgl
│   └── loops.mgl
├── scripts/
│   └── smoke-test.js
├── src/
│   ├── cli.js
│   ├── index.js
│   ├── interpreter/
│   │   └── interpreter.js
│   ├── lexer/
│   │   ├── lexer.js
│   │   └── token.js
│   ├── parser/
│   │   ├── ast.js
│   │   └── parser.js
│   ├── repl/
│   │   └── repl.js
│   ├── runtime/
│   │   ├── environment.js
│   │   ├── stdlib/
│   │   │   ├── core.js
│   │   │   ├── index.js
│   │   │   └── io.js
│   │   └── values.js
│   └── utils/
│       └── errors.js
└── website/
    ├── index.html
    └── styles.css
```

## Documentation

- [Documentation hub](docs/README.md)
- [Getting started](docs/getting-started.md)
- [Syntax reference](docs/syntax.md)
- [Examples](docs/examples.md)
- [GitHub release guide](docs/github-release.md)

## Development

Run the built-in smoke tests:

```bash
npm test
```

Scaffold a new project:

```bash
mgl init project
```

## Philosophy

MGL aims to be a serious starter language project, not a toy. The implementation favors clarity, predictable behavior, and a structure that can grow into a richer ecosystem over time.
