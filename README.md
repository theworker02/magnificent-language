![Version](https://img.shields.io/badge/version-1.6.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Build](https://img.shields.io/badge/build-passing-brightgreen)
![Memory](https://img.shields.io/badge/living-memory-enabled-orange)
![Predictive](https://img.shields.io/badge/predictive-execution-crimson)
![Native](https://img.shields.io/badge/native-rust%20%2B%20linux-brown)

# Magnificent Language

Magnificent Language, or MGL, is a typed programming platform with modules, classes, async services, memory intelligence, architectural analysis, predictive execution, Rust interoperability, Unity output, and Linux-native tooling.

Version 1.6.0 makes MGL feel like a real language platform:

- write scripts, APIs, workers, and background services
- inspect runtime memory behavior directly from the language
- analyze intent, architecture, performance, and health
- predict outputs, branches, memory pressure, and game-frame behavior before runtime
- offload hot paths to Rust with `import rust "..."`
- generate Unity-compatible C# with `mgl build --unity`
- build Linux-ready executable bundles with `mgl build --native`

## Flagship Features

### Living Memory Architecture

```mgl
let items = track [1, 2, 3]
print(memoryOf(items))
print(whyAlive(items))
```

### Predictive Execution Engine

```bash
mgl predict examples/main.mgl
mgl predict --game examples/unity/player.mgl
```

### Native Systems Integration

```mgl
import rust "./rust/math.rs" as math

print(math.add(5, 10))
print(system.os())
```

### Unity Build Path

```bash
mgl build examples/unity/player.mgl --unity
mgl unity examples/unity/player.mgl --watch
```

## Quick Start

```bash
npm install
node bin/mgl run examples/main.mgl
node bin/mgl run examples/rust-interop.mgl
node bin/mgl run examples/system-demo.mgl
node bin/mgl predict --game examples/unity/player.mgl
node bin/mgl build examples/main.mgl --native
node bin/mgl build examples/unity/player.mgl --unity
```

## CLI

```bash
mgl run examples/main.mgl
mgl build examples/rust-interop.mgl --rust
mgl build examples/main.mgl --native
mgl build examples/unity/player.mgl --unity
mgl predict examples/main.mgl
mgl predict --game examples/unity/player.mgl
mgl unity examples/unity/player.mgl --watch
mgl analyze examples/intelligence-demo.mgl --graph
mgl serve examples/api-server.mgl
mgl test api examples/api-server.mgl
mgl memory examples/main.mgl
mgl doctor
```

## Config

MGL reads `mgl.config.json` from the project tree.

```json
{
  "entry": "main.mgl",
  "mode": "script",
  "port": 3000,
  "strictTypes": false,
  "optimize": false,
  "memoryMode": "balanced",
  "trackAllocations": false,
  "intelligence": {
    "enabled": true,
    "learning": true,
    "strictAnalysis": false
  },
  "predict": {
    "enabled": true,
    "maxPaths": 50,
    "maxLoopIterations": 20,
    "framesToSimulate": 5
  },
  "unity": {
    "enabled": true,
    "mode": "transpile",
    "hotReload": false,
    "outputDir": "build/unity"
  },
  "sandbox": {
    "enabled": false,
    "allowExec": true,
    "allowRust": true
  }
}
```

## Included Examples

- `examples/main.mgl`
- `examples/api-server.mgl`
- `examples/async-example.mgl`
- `examples/task-system.mgl`
- `examples/intelligence-demo.mgl`
- `examples/rust-interop.mgl`
- `examples/system-demo.mgl`
- `examples/unity/player.mgl`
- `examples/memory-arrays.mgl`
- `examples/memory-types.mgl`
- `examples/memory-snapshots.mgl`
- `examples/memory-watchers.mgl`

## Project Structure

```text
magnificent-language/
├── README.md
├── bin/
│   └── mgl
├── docs/
│   ├── README.md
│   ├── cli-memory-tools.md
│   ├── examples.md
│   ├── ffi.md
│   ├── game-prediction.md
│   ├── getting-started.md
│   ├── intelligence.md
│   ├── linux-support.md
│   ├── memory-intelligence.md
│   ├── modules.md
│   ├── optimization-hints.md
│   ├── predictive-engine.md
│   ├── rust-integration.md
│   ├── snapshots.md
│   ├── syntax.md
│   ├── tooling.md
│   ├── tracking.md
│   └── unity-integration.md
├── examples/
│   ├── api-server.mgl
│   ├── async-example.mgl
│   ├── intelligence-demo.mgl
│   ├── main.mgl
│   ├── rust-interop.mgl
│   ├── system-demo.mgl
│   ├── task-system.mgl
│   ├── unity/
│   │   └── player.mgl
│   └── rust/
│       └── math.rs
├── scripts/
│   └── smoke-test.js
└── src/
    ├── analyzer/
    ├── cli/
    │   ├── build-native/
    │   ├── build-rust/
    │   └── memory.js
    ├── graphs/
    ├── insights/
    ├── intelligence/
    ├── interpreter/
    ├── lexer/
    ├── parser/
    ├── predictor/
    ├── refactor/
    ├── repl/
    ├── runtime/
    │   ├── async/
    │   ├── ffi/
    │   ├── fs/
    │   ├── http/
    │   ├── logging/
    │   ├── memory/
    │   ├── rust/
    │   ├── server/
    │   ├── stdlib/
    │   ├── system/
    │   └── tasks/
    ├── tooling/
    └── unity/
```

## Docs

- [Documentation Index](docs/README.md)
- [Predictive Engine](docs/predictive-engine.md)
- [Rust Integration](docs/rust-integration.md)
- [Linux Support](docs/linux-support.md)
- [FFI](docs/ffi.md)
- [Unity Integration](docs/unity-integration.md)
- [Game Prediction](docs/game-prediction.md)
