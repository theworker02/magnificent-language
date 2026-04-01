![Version](https://img.shields.io/badge/version-1.0.0-blue)
![VS Code](https://img.shields.io/badge/VS%20Code-1.85%2B-007ACC)
![File Type](https://img.shields.io/badge/file-.mgl-8A2BE2)
![Commands](https://img.shields.io/badge/commands-5-brightgreen)

# Magnificent Language for VS Code

This extension adds first-party editor support for Magnificent Language (`.mgl`) files.

Extension icon asset: `mgl-extension-icon.png`

## Features

- `.mgl` file association
- Syntax highlighting for keywords, declarations, comments, strings, numbers, and calls
- Snippets for common language constructs
- Bracket, quote, and comment configuration
- Command Palette actions:
  - `MGL: Run Current File`
  - `MGL: Open REPL`
  - `MGL: Initialize Project`
  - `MGL: Insert Main Template`
  - `MGL: Insert Import Statement`

## Commands

The extension uses the existing MGL CLI.

When you run it inside this repository, it automatically falls back to the local `bin/mgl` runner. If you want to override that, set a custom CLI path:

- `mgl run <file>`
- `mgl repl`

Set the CLI path in VS Code settings if needed:

```json
{
  "magnificentLanguage.cliPath": "mgl"
}
```

## Local Development

If you open the repository root in VS Code:

1. Press `F5`.
2. Choose `Run MGL VS Code Extension`.
3. A new Extension Development Host window will open with the repo workspace.

If you open only `mgl-extension` in VS Code:

1. Press `F5`.
2. Choose `Run MGL Extension`.

Then open any `.mgl` file in the development host and run `MGL: Run Current File` from the Command Palette.

## Included Snippets

- `func`
- `class`
- `method`
- `if`
- `ife`
- `elif`
- `loop`
- `loops`
- `import`
- `array`
- `print`
- `main`
- `module`

## Packaging

This subproject is ready for packaging with `vsce`.

Package it with:

```bash
cd mgl-extension
npx @vscode/vsce package
```

For full release steps, see [../docs/github-release.md](../docs/github-release.md).
