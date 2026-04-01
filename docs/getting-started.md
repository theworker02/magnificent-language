# Getting Started With MGL

## Requirements

- Node.js 18 or newer
- npm 9 or newer

## Installation

Install the project locally:

```bash
npm install
```

Install the `mgl` command into your shell:

```bash
npm link
```

Check that the CLI is available:

```bash
mgl version
```

Create a new project scaffold:

```bash
mgl init demo-app
```

## Running Your First Program

Create a file named `hello.mgl`:

```mgl
print("Hello, Magnificent Language")
```

Run it:

```bash
mgl run hello.mgl
```

## Interactive REPL

Launch the interactive shell:

```bash
mgl repl
```

Example session:

```text
> let x = 10
> x + 5
15
```

## Development Without Linking

If you do not want to install the CLI globally, use the local entry point:

```bash
node bin/mgl run hello.mgl
```

## Included Examples

- `examples/hello.mgl`
- `examples/loops.mgl`
- `examples/classes.mgl`
- `examples/imports.mgl`

## Test The Runtime

Run the smoke suite:

```bash
npm test
```

This executes the example programs and checks for expected output.
