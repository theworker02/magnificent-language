const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { PassThrough } = require("stream");

const { runCli } = require("../src/cli");
const { startRepl } = require("../src/repl/repl");

const root = path.resolve(__dirname, "..");

async function main() {
  const cases = [
    {
      args: ["help"],
      includes: ["Magnificent Language CLI", "mgl predict [file.mgl] [--game]", "mgl build [file.mgl] [--rust|--native|--unity]"],
    },
    {
      args: ["version"],
      includes: ["mgl 1.6.0"],
    },
    {
      args: ["run", path.join(root, "examples", "hello.mgl")],
      includes: [
        "Hello from Magnificent Language",
        "Welcome to MGL",
        "2 + 3 = 5",
      ],
    },
    {
      args: ["run", path.join(root, "examples", "loops.mgl")],
      includes: [
        "i=1, total=1",
        "i=5, total=15",
        "The sum is big",
        "countdown=0",
      ],
    },
    {
      args: ["run", path.join(root, "examples", "classes.mgl")],
      includes: [
        "Roadster is driving at 88 mph",
        "Car(Roadster, 88)",
      ],
    },
    {
      args: ["run", path.join(root, "examples", "imports.mgl")],
      includes: [
        "sum=12",
        "average=2.5",
        "length=4",
        "kind=array<number>",
      ],
    },
    {
      args: ["run", path.join(root, "examples", "main.mgl")],
      includes: [
        "MGL report for main example",
        "sum=20",
        "average=5",
        "samples: 2, 4, 6, 8",
        "Quarterly => 2 | 4 | 6 | 8",
        "tracked=true",
        "allocations=1",
        "async=ready",
        "task=warmup complete",
      ],
    },
    {
      args: ["run", path.join(root, "examples", "async-example.mgl")],
      includes: [
        "future=future",
        "result=42",
      ],
    },
    {
      args: ["run", path.join(root, "examples", "task-system.mgl")],
      includes: [
        "status=running",
        "task: cleanup complete",
        "status=completed",
      ],
    },
    {
      args: ["run", path.join(root, "examples", "memory-arrays.mgl")],
      includes: [
        "tracked: true",
        "Allocation #",
      ],
    },
    {
      args: ["run", path.join(root, "examples", "rust-interop.mgl")],
      includes: [
        "rust-add=15",
        "rust-scale=3, 6, 9, 12",
        "rust-average=5",
        "Hello, MGL from Rust",
      ],
    },
    {
      args: ["run", path.join(root, "examples", "system-demo.mgl")],
      includes: [
        "os=",
        "exec-output=exec-ok",
        "spawn-status=completed",
      ],
    },
  ];

  for (const testCase of cases) {
    const result = await executeCli(testCase.args);
    assert.strictEqual(result.status, 0, `Expected success for args: ${testCase.args.join(" ")}`);

    for (const expected of testCase.includes) {
      assert.ok(
        result.stdout.includes(expected),
        `Expected output to include "${expected}" for args: ${testCase.args.join(" ")}\nActual output:\n${result.stdout}\n${result.stderr}`,
      );
    }
  }

  await verifyCheckCommand();
  await verifyAstAndTokensCommands();
  await verifyDoctorCommand();
  await verifyPredictCommand();
  await verifyRustBuild();
  await verifyUnityBuild();
  await verifyNativeBuild();
  await verifyInitCommand();
  await verifyDuplicateImportCaching();
  await verifyFileIoStdlib();
  await verifyTypeEnforcement();
  await verifyApiTests();
  await verifyIntelligenceCommands();
  await verifyMemoryBuiltins();
  await verifyMemoryCommand();
  await verifyWatchMemory();
  await verifyErrorFormatting();
  await verifyReplPersistence();

  console.log("Smoke tests passed.");
}

async function executeCli(args, io = {}) {
  const stdout = io.stdout || createBufferStream();
  const stderr = io.stderr || createBufferStream();
  const status = await Promise.resolve(runCli(args, { stdout, stderr, color: false }));
  return {
    status,
    stdout: stdout.output || "",
    stderr: stderr.output || "",
  };
}

async function verifyCheckCommand() {
  const result = await executeCli(["check", path.join(root, "examples", "main.mgl")]);

  assert.strictEqual(result.status, 0, "Expected check command to succeed.");
  assert.ok(result.stdout.includes("Check passed for 3 file(s)."), `Unexpected check output:\n${result.stdout}`);
  assert.ok(result.stdout.includes(path.join("examples", "main.mgl")), `Unexpected check output:\n${result.stdout}`);
}

async function verifyAstAndTokensCommands() {
  const astResult = await executeCli(["ast", path.join(root, "examples", "memory-types.mgl")]);
  assert.strictEqual(astResult.status, 0, "Expected ast command to succeed.");
  assert.ok(astResult.stdout.includes("\"type\": \"TypeDeclaration\""), `Unexpected ast output:\n${astResult.stdout}`);
  assert.ok(astResult.stdout.includes("\"type\": \"TrackExpression\""), `Unexpected ast output:\n${astResult.stdout}`);

  const tokenResult = await executeCli(["tokens", path.join(root, "examples", "memory-types.mgl")]);
  assert.strictEqual(tokenResult.status, 0, "Expected tokens command to succeed.");
  assert.ok(tokenResult.stdout.includes("IDENTIFIER \"type\""), `Unexpected token output:\n${tokenResult.stdout}`);
  assert.ok(tokenResult.stdout.includes("COLON"), `Unexpected token output:\n${tokenResult.stdout}`);
}

async function verifyDoctorCommand() {
  const result = await executeCli(["doctor"]);
  assert.strictEqual(result.status, 0, "Expected doctor command to succeed.");
  assert.ok(result.stdout.includes("MGL Doctor"), `Unexpected doctor output:\n${result.stdout}`);
  assert.ok(result.stdout.includes("cargo:"), `Unexpected doctor output:\n${result.stdout}`);
  assert.ok(result.stdout.includes("rustc:"), `Unexpected doctor output:\n${result.stdout}`);
  assert.ok(result.stdout.includes("CLI: healthy"), `Unexpected doctor output:\n${result.stdout}`);
}

async function verifyPredictCommand() {
  const summary = await executeCli(["predict", path.join(root, "examples", "main.mgl")]);
  assert.strictEqual(summary.status, 0, "Expected predict command to succeed.");
  assert.ok(summary.stdout.includes("Predicted Output"), `Unexpected predict output:\n${summary.stdout}`);
  assert.ok(summary.stdout.includes("Confidence:"), `Unexpected predict output:\n${summary.stdout}`);

  const game = await executeCli(["predict", "--game", path.join(root, "examples", "unity", "player.mgl")]);
  assert.strictEqual(game.status, 0, "Expected game prediction to succeed.");
  assert.ok(game.stdout.includes("Game Forecast"), `Unexpected game predict output:\n${game.stdout}`);
  assert.ok(game.stdout.includes("Frames simulated:"), `Unexpected game predict output:\n${game.stdout}`);
}

async function verifyRustBuild() {
  const result = await executeCli(["build", path.join(root, "examples", "rust-interop.mgl"), "--rust"]);
  assert.strictEqual(result.status, 0, "Expected rust build command to succeed.");
  assert.ok(result.stdout.includes("Rust build targets: 1"), `Unexpected rust build output:\n${result.stdout}`);
  assert.ok(result.stdout.includes("exports: add, scale, average, greet"), `Unexpected rust build output:\n${result.stdout}`);
}

async function verifyUnityBuild() {
  const result = await executeCli(["build", path.join(root, "examples", "unity", "player.mgl"), "--unity"]);
  assert.strictEqual(result.status, 0, "Expected unity build command to succeed.");
  assert.ok(result.stdout.includes("Generated scripts: 2"), `Unexpected unity build output:\n${result.stdout}`);
  assert.ok(
    fs.existsSync(path.join(root, "examples", "unity", "build", "unity", "Assets", "MGLGenerated", "Player.cs")),
    "Expected generated Player.cs to exist.",
  );
}

async function verifyNativeBuild() {
  const result = await executeCli(["build", path.join(root, "examples", "main.mgl"), "--native"]);
  assert.strictEqual(result.status, 0, "Expected native build command to succeed.");
  assert.ok(result.stdout.includes("Native bundle:"), `Unexpected native build output:\n${result.stdout}`);

  const executablePath = path.join(root, "examples", "build", "native", "main", process.platform === "win32" ? "run.cmd" : "main");
  assert.ok(fs.existsSync(executablePath), "Expected native executable bundle to exist.");
  if (process.platform !== "win32") {
    const mode = fs.statSync(executablePath).mode & 0o777;
    assert.ok((mode & 0o111) !== 0, "Expected native bundle to be executable on Unix.");
  }

  const bundledEntry = path.join(root, "examples", "build", "native", "main", "app", "main.mgl");
  assert.ok(fs.existsSync(bundledEntry), "Expected bundled entry file to exist.");
}

async function verifyInitCommand() {
  const tempRoot = createTempDirectory("mgl-init-");
  const projectDir = path.join(tempRoot, "sample-project");
  const result = await executeCli(["init", projectDir]);

  assert.strictEqual(result.status, 0, "Expected init command to succeed.");
  assert.ok(fs.existsSync(path.join(projectDir, "main.mgl")), "Expected main.mgl to be created.");
  assert.ok(fs.existsSync(path.join(projectDir, "mgl.config.json")), "Expected config file to be created.");
  assert.ok(fs.existsSync(path.join(projectDir, "modules", "math.mgl")), "Expected starter module to be created.");
  assert.ok(fs.existsSync(path.join(projectDir, "modules", "memory_demo.mgl")), "Expected memory demo to be created.");
  assert.ok(fs.existsSync(path.join(projectDir, "modules", "platform_demo.mgl")), "Expected platform demo to be created.");
}

async function verifyDuplicateImportCaching() {
  const tempRoot = createTempDirectory("mgl-import-");
  const moduleFile = path.join(tempRoot, "counter.mgl");
  const mainFile = path.join(tempRoot, "main.mgl");

  fs.writeFileSync(
    moduleFile,
    [
      "print(\"loaded\")",
      "",
      "export func value(): number {",
      "  return 42",
      "}",
      "",
    ].join("\n"),
    "utf8",
  );

  fs.writeFileSync(
    mainFile,
    [
      "import \"./counter.mgl\" as counter",
      "import \"./counter.mgl\" as counterAgain",
      "print(counter.value())",
      "print(counterAgain.value())",
      "",
    ].join("\n"),
    "utf8",
  );

  const result = await executeCli(["run", mainFile]);
  assert.strictEqual(result.status, 0, "Expected cached imports to succeed.");
  assert.strictEqual(
    countOccurrences(result.stdout, "loaded"),
    1,
    `Expected module side effects to run once.\nActual output:\n${result.stdout}`,
  );
  assert.ok(result.stdout.includes("42"), "Expected imported function call to succeed.");
}

async function verifyFileIoStdlib() {
  const tempRoot = createTempDirectory("mgl-io-");
  const mainFile = path.join(tempRoot, "main.mgl");

  fs.writeFileSync(
    mainFile,
    [
      "writeFile(\"note.txt\", \"hello io\")",
      "print(readFile(\"note.txt\"))",
      "print(exists(\"note.txt\"))",
      "print(type(readLines(\"note.txt\")))",
      "",
    ].join("\n"),
    "utf8",
  );

  const result = await executeCli(["run", mainFile]);
  assert.strictEqual(result.status, 0, "Expected stdlib file I/O to succeed.");
  assert.ok(result.stdout.includes("hello io"), "Expected file contents to be printed.");
  assert.ok(result.stdout.includes("true"), "Expected exists() to report the file.");
  assert.ok(result.stdout.includes("array<string>"), "Expected readLines() to produce a typed string array.");
  assert.strictEqual(fs.readFileSync(path.join(tempRoot, "note.txt"), "utf8"), "hello io");
}

async function verifyTypeEnforcement() {
  const tempRoot = createTempDirectory("mgl-types-");
  const mainFile = path.join(tempRoot, "main.mgl");

  fs.writeFileSync(
    mainFile,
    [
      "let count: number = 2",
      "count = \"oops\"",
      "",
    ].join("\n"),
    "utf8",
  );

  const result = await executeCli(["run", mainFile]);
  assert.strictEqual(result.status, 1, "Expected type mismatch to fail.");
  assert.ok(result.stderr.includes("Variable 'count' expected number."), `Unexpected error:\n${result.stderr}`);
  assert.ok(result.stderr.includes("Received string."), `Unexpected error:\n${result.stderr}`);
}

async function verifyApiTests() {
  const result = await executeCli(["test", "api", path.join(root, "examples", "api-server.mgl")]);

  assert.strictEqual(result.status, 0, "Expected API tests to succeed.");
  assert.ok(result.stdout.includes("PASS root route responds"), `Unexpected output:\n${result.stdout}`);
  assert.ok(result.stdout.includes("PASS users route returns json"), `Unexpected output:\n${result.stdout}`);
  assert.ok(result.stdout.includes("PASS echo route accepts json bodies"), `Unexpected output:\n${result.stdout}`);
  assert.ok(result.stdout.includes("3 passed, 0 failed."), `Unexpected output:\n${result.stdout}`);
}

async function verifyIntelligenceCommands() {
  const analyze = await executeCli(["analyze", path.join(root, "examples", "intelligence-demo.mgl"), "--graph"]);
  assert.strictEqual(analyze.status, 0, "Expected analyze command to succeed.");
  assert.ok(analyze.stdout.includes("Detected monolithic route structure"), `Unexpected output:\n${analyze.stdout}`);
  assert.ok(analyze.stdout.includes("Architecture Graph"), `Unexpected output:\n${analyze.stdout}`);

  const improve = await executeCli(["improve", path.join(root, "examples", "intelligence-demo.mgl")]);
  assert.strictEqual(improve.status, 0, "Expected improve command to succeed.");
  assert.ok(improve.stdout.includes("Priority Improvements"), `Unexpected output:\n${improve.stdout}`);
  assert.ok(improve.stdout.includes("Function 'processData'") || improve.stdout.includes("Detected monolithic route structure"), `Unexpected output:\n${improve.stdout}`);

  const explain = await executeCli(["explain", path.join(root, "examples", "api-server.mgl")]);
  assert.strictEqual(explain.status, 0, "Expected explain command to succeed.");
  assert.ok(explain.stdout.includes("What The Code Does"), `Unexpected output:\n${explain.stdout}`);
  assert.ok(explain.stdout.includes("Requests enter through server routes"), `Unexpected output:\n${explain.stdout}`);

  const performance = await executeCli(["performance", path.join(root, "examples", "intelligence-demo.mgl")]);
  assert.strictEqual(performance.status, 0, "Expected performance command to succeed.");
  assert.ok(performance.stdout.includes("Performance Insights"), `Unexpected output:\n${performance.stdout}`);
  assert.ok(performance.stdout.includes("Memory Insights"), `Unexpected output:\n${performance.stdout}`);

  const refactor = await executeCli(["refactor", path.join(root, "examples", "intelligence-demo.mgl")]);
  assert.strictEqual(refactor.status, 0, "Expected refactor command to succeed.");
  assert.ok(refactor.stdout.includes("Refactor Plan"), `Unexpected output:\n${refactor.stdout}`);
  assert.ok(refactor.stdout.includes("Rename 'x'"), `Unexpected output:\n${refactor.stdout}`);

  const health = await executeCli(["health", path.join(root, "examples", "intelligence-demo.mgl")]);
  assert.strictEqual(health.status, 0, "Expected health command to succeed.");
  assert.ok(health.stdout.includes("Complexity score:"), `Unexpected output:\n${health.stdout}`);
  assert.ok(health.stdout.includes("Overall:"), `Unexpected output:\n${health.stdout}`);
}

async function verifyMemoryBuiltins() {
  const result = await executeCli(["run", path.join(root, "examples", "memory-types.mgl")]);

  assert.strictEqual(result.status, 0, "Expected memory builtins example to succeed.");
  assert.ok(result.stdout.includes("tracked: true"), `Unexpected output:\n${result.stdout}`);
  assert.ok(result.stdout.includes("Inventory"), `Unexpected output:\n${result.stdout}`);
  assert.ok(result.stdout.includes("variable 'inv' in scope 'global'"), `Unexpected output:\n${result.stdout}`);

  const snapshotResult = await executeCli(["run", path.join(root, "examples", "memory-snapshots.mgl")]);
  assert.strictEqual(snapshotResult.status, 0, "Expected snapshot example to succeed.");
  assert.ok(snapshotResult.stdout.includes("allocationDelta"), `Unexpected snapshot output:\n${snapshotResult.stdout}`);
}

async function verifyMemoryCommand() {
  const summary = await executeCli(["memory", path.join(root, "examples", "main.mgl")]);
  assert.strictEqual(summary.status, 0, "Expected memory summary to succeed.");
  assert.ok(summary.stdout.includes("Memory Summary"), `Unexpected memory output:\n${summary.stdout}`);
  assert.ok(summary.stdout.includes("Total tracked allocations"), `Unexpected memory output:\n${summary.stdout}`);

  const live = await executeCli(["memory", "--live", path.join(root, "examples", "main.mgl")]);
  assert.strictEqual(live.status, 0, "Expected live memory output to succeed.");
  assert.ok(live.stdout.includes("Live Allocations"), `Unexpected live output:\n${live.stdout}`);

  const graph = await executeCli(["memory", "--graph", path.join(root, "examples", "main.mgl")]);
  assert.strictEqual(graph.status, 0, "Expected memory graph output to succeed.");
  assert.ok(graph.stdout.includes("module#"), `Unexpected graph output:\n${graph.stdout}`);

  const leaks = await executeCli(["memory", "--leaks", path.join(root, "examples", "main.mgl")]);
  assert.strictEqual(leaks.status, 0, "Expected leak report to succeed.");
  assert.ok(
    leaks.stdout.includes("Potential Long-Lived Allocations") || leaks.stdout.includes("No suspicious long-lived allocations found."),
    `Unexpected leak output:\n${leaks.stdout}`,
  );
}

async function verifyWatchMemory() {
  const tempRoot = createTempDirectory("mgl-watch-");
  const mainFile = path.join(tempRoot, "main.mgl");
  const configFile = path.join(tempRoot, "mgl.config.json");

  fs.writeFileSync(
    configFile,
    JSON.stringify({
      entry: "main.mgl",
      memoryMode: "debug-memory",
      trackAllocations: true,
      memoryWarnings: true,
      snapshotOnExit: false,
      explainOwnership: true,
    }, null, 2),
    "utf8",
  );

  fs.writeFileSync(
    mainFile,
    [
      "let queue = track [\"a\", \"b\"]",
      "print(watchMemory(queue, \"queue\"))",
      "push(queue, \"c\")",
      "queue[0] = \"z\"",
      "",
    ].join("\n"),
    "utf8",
  );

  const result = await executeCli(["run", mainFile]);
  assert.strictEqual(result.status, 0, "Expected watchMemory program to succeed.");
  assert.ok(result.stdout.includes("tracked: true"), `Unexpected watch output:\n${result.stdout}`);
  assert.ok(result.stdout.includes("[memory-watch]"), `Expected watcher logs.\n${result.stdout}`);
}

async function verifyErrorFormatting() {
  const tempRoot = createTempDirectory("mgl-error-");
  const badFile = path.join(tempRoot, "broken.mgl");

  fs.writeFileSync(
    badFile,
    [
      "func broken(): number {",
      "  print(\"oops\")",
      "",
    ].join("\n"),
    "utf8",
  );

  const result = await executeCli(["run", badFile]);
  assert.strictEqual(result.status, 1, "Expected invalid syntax to fail.");
  assert.ok(result.stderr.includes("MGL ParseError"), "Expected parse error heading.");
  assert.ok(result.stderr.includes("broken.mgl:3:1"), "Expected line and column in output.");
  assert.ok(result.stderr.includes("^"), "Expected caret snippet in output.");
}

async function verifyReplPersistence() {
  const input = new PassThrough();
  const stdout = createPassThroughCapture();
  const stderr = createPassThroughCapture();

  const promise = startRepl({
    stdin: input,
    stdout,
    stderr,
    color: false,
  });

  input.write("let x: number = 10\n");
  input.write(".type x\n");
  input.write(".memory x\n");
  input.write("x + 5\n");
  input.write(".symbols\n");
  input.write(".exit\n");
  input.end();

  const status = await promise;
  assert.strictEqual(status, 0, "Expected REPL to exit cleanly.");
  assert.ok(stdout.output.includes("number"), `Expected REPL to print type information.\nActual output:\n${stdout.output}`);
  assert.ok(stdout.output.includes("tracked: false"), `Expected REPL memory inspection to work.\nActual output:\n${stdout.output}`);
  assert.ok(stdout.output.includes("15"), `Expected REPL to print expression results.\nActual output:\n${stdout.output}`);
  assert.ok(stdout.output.includes("x: number = 10"), `Expected REPL to print user symbols.\nActual output:\n${stdout.output}`);
}

function createBufferStream() {
  return {
    output: "",
    write(chunk) {
      this.output += String(chunk);
      return true;
    },
  };
}

function createPassThroughCapture() {
  const stream = new PassThrough();
  stream.output = "";
  stream.on("data", (chunk) => {
    stream.output += chunk.toString("utf8");
  });
  return stream;
}

function countOccurrences(text, search) {
  return text.split(search).length - 1;
}

function createTempDirectory(prefix) {
  return fs.mkdtempSync(path.join("/tmp", prefix));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
