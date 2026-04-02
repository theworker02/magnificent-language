# Getting Started With MGL

## Requirements

- Node.js 18 or newer
- npm 9 or newer

## Install

```bash
npm install
```

Optional global link:

```bash
npm link
```

## Run The Main Example

```bash
mgl run examples/main.mgl
```

Expected output:

```text
MGL report for main example
sum=20
average=5
samples: 2, 4, 6, 8
Quarterly => 2 | 4 | 6 | 8
tracked=true
allocations=1
async=ready
task=warmup complete
```

## Try Predictive Execution

```bash
mgl predict examples/main.mgl
mgl predict --game examples/unity/player.mgl
```

## Build Native And Unity Outputs

```bash
mgl build examples/rust-interop.mgl --rust
mgl build examples/main.mgl --native
mgl build examples/unity/player.mgl --unity
```

## Run Rust And System Examples

```bash
mgl run examples/rust-interop.mgl
mgl run examples/system-demo.mgl
```

## Run An API Test Suite

```bash
mgl test api examples/api-server.mgl
```

## Try The Intelligence Commands

```bash
mgl analyze examples/intelligence-demo.mgl --graph
mgl improve examples/intelligence-demo.mgl
mgl health examples/intelligence-demo.mgl
```

## Start The Built-In Server

```bash
mgl serve examples/api-server.mgl
```

## Inspect Memory

```bash
mgl memory examples/main.mgl
mgl memory --live examples/main.mgl
mgl memory --graph examples/main.mgl
mgl memory --leaks examples/main.mgl
```

## Try Async And Tasks

```bash
mgl run examples/async-example.mgl
mgl run examples/task-system.mgl
```

## REPL

```bash
mgl repl
```

Useful REPL commands:

- `.type <expr>`
- `.memory <expr>`
- `.symbols`
- `.load <file>`

## Config

Create `mgl.config.json`:

```json
{
  "entry": "main.mgl",
  "mode": "script",
  "port": 3000,
  "watch": false,
  "memoryMode": "debug-memory",
  "trackAllocations": true,
  "memoryWarnings": true,
  "snapshotOnExit": false,
  "explainOwnership": true,
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

Then these commands can omit the file path when run from that project:

```bash
mgl run
mgl build
mgl predict
mgl unity
mgl serve
mgl test
mgl memory
```

## Validate And Inspect

```bash
mgl check examples/main.mgl
mgl ast examples/memory-types.mgl
mgl tokens examples/memory-types.mgl
mgl doctor
```
