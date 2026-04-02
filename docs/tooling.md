# MGL Tooling

## Core CLI Commands

- `mgl run [file.mgl]`
- `mgl build [file.mgl] [--rust|--native|--unity]`
- `mgl predict [file.mgl] [--game]`
- `mgl unity [file.mgl] [--watch]`
- `mgl analyze [file.mgl] [--graph]`
- `mgl improve [file.mgl]`
- `mgl explain [file.mgl]`
- `mgl performance [file.mgl]`
- `mgl refactor [file.mgl]`
- `mgl health [file.mgl]`
- `mgl serve [file.mgl] [--watch]`
- `mgl test [api] [file.mgl]`
- `mgl check [file.mgl]`
- `mgl ast <file.mgl>`
- `mgl tokens <file.mgl>`
- `mgl repl`
- `mgl memory [--live|--graph|--leaks] [file.mgl]`
- `mgl doctor`
- `mgl init <project>`

If `mgl.config.json` is present, `run`, `build`, `predict`, `unity`, `analyze`, `improve`, `explain`, `performance`, `refactor`, `health`, `serve`, `test`, `check`, and `memory` can resolve the default entry automatically.

## REPL Commands

- `.help`
- `.reset`
- `.load <file>`
- `.type <expr>`
- `.memory <expr>`
- `.symbols`
- `.exit`
