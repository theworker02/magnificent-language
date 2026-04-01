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
      includes: ["Magnificent Language CLI", "mgl repl", "mgl init <project>"],
    },
    {
      args: ["version"],
      includes: ["mgl 1.0.0"],
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
        "kind=array",
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

  await verifyInitCommand();
  await verifyDuplicateImportCaching();
  await verifyFileIoStdlib();
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

async function verifyInitCommand() {
  const tempRoot = createTempDirectory("mgl-init-");
  const projectDir = path.join(tempRoot, "sample-project");
  const result = await executeCli(["init", projectDir]);

  assert.strictEqual(result.status, 0, "Expected init command to succeed.");
  assert.ok(fs.existsSync(path.join(projectDir, "main.mgl")), "Expected main.mgl to be created.");
  assert.ok(fs.existsSync(path.join(projectDir, "mgl.config.json")), "Expected config file to be created.");
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
      "func value() {",
      "  return 42",
      "}",
      "",
    ].join("\n"),
    "utf8",
  );

  fs.writeFileSync(
    mainFile,
    [
      "import \"./counter.mgl\"",
      "import \"./counter.mgl\"",
      "print(counter.value())",
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
      "",
    ].join("\n"),
    "utf8",
  );

  const result = await executeCli(["run", mainFile]);
  assert.strictEqual(result.status, 0, "Expected stdlib file I/O to succeed.");
  assert.ok(result.stdout.includes("hello io"), "Expected file contents to be printed.");
  assert.strictEqual(fs.readFileSync(path.join(tempRoot, "note.txt"), "utf8"), "hello io");
}

async function verifyErrorFormatting() {
  const tempRoot = createTempDirectory("mgl-error-");
  const badFile = path.join(tempRoot, "broken.mgl");

  fs.writeFileSync(
    badFile,
    [
      "func broken() {",
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

  input.write("let x = 10\n");
  input.write("x + 5\n");
  input.write(".exit\n");
  input.end();

  const status = await promise;
  assert.strictEqual(status, 0, "Expected REPL to exit cleanly.");
  assert.ok(stdout.output.includes("15"), `Expected REPL to print expression results.\nActual output:\n${stdout.output}`);
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
