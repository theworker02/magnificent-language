const path = require("path");
const readline = require("readline");

const { createSession, runFile, runSource, version } = require("../index");
const { runtimeValueFromJs, stringifyValue } = require("../runtime/values");
const { describeRuntimeType, stringifyType } = require("../runtime/types");
const { inspectValue } = require("../runtime/memory");
const { formatError } = require("../utils/errors");

function startRepl(options = {}) {
  const stdin = options.stdin || process.stdin;
  const stdout = options.stdout || process.stdout;
  const stderr = options.stderr || process.stderr;
  const color = options.color ?? Boolean(stderr.isTTY);
  let session = options.session || createSession({
    stdout,
    stderr,
    cwd: options.cwd || process.cwd(),
  });

  const rl = readline.createInterface({
    input: stdin,
    output: stdout,
    historySize: 1000,
  });

  let buffer = "";
  let lineQueue = Promise.resolve();

  stdout.write(`Magnificent Language REPL v${version}\n`);
  stdout.write("Type .help for commands and .exit to quit.\n");
  rl.setPrompt("> ");
  rl.prompt();

  return new Promise((resolve) => {
    const processLine = async (line) => {
      const trimmed = line.trim();

      if (!buffer && trimmed === ".exit") {
        rl.close();
        return;
      }

      if (!buffer && trimmed === ".help") {
        stdout.write(".help           Show REPL commands\n");
        stdout.write(".reset          Reset the current session\n");
        stdout.write(".load <file>    Run an MGL file in the current session\n");
        stdout.write(".type <expr>    Evaluate an expression and print its runtime type\n");
        stdout.write(".memory <expr>  Evaluate an expression and print tracked memory info\n");
        stdout.write(".symbols        Show user-defined bindings\n");
        stdout.write(".exit           Exit the REPL\n");
        rl.prompt();
        return;
      }

      if (!buffer && trimmed === ".reset") {
        session = createSession({
          stdout,
          stderr,
          cwd: options.cwd || process.cwd(),
        });
        stdout.write("Session reset.\n");
        rl.prompt();
        return;
      }

      if (!buffer && trimmed.startsWith(".load ")) {
        await handleLoadCommand(trimmed.slice(6), session, options, stdout, stderr, color);
        rl.prompt();
        return;
      }

      if (!buffer && trimmed.startsWith(".type ")) {
        await handleTypeCommand(trimmed.slice(6), session, options, stdout, stderr, color);
        rl.prompt();
        return;
      }

      if (!buffer && trimmed.startsWith(".memory ")) {
        await handleMemoryCommand(trimmed.slice(8), session, options, stdout, stderr, color);
        rl.prompt();
        return;
      }

      if (!buffer && trimmed === ".symbols") {
        printSymbols(session, stdout);
        rl.prompt();
        return;
      }

      const source = buffer ? `${buffer}\n${line}` : line;
      if (!source.trim()) {
        buffer = "";
        rl.setPrompt("> ");
        rl.prompt();
        return;
      }

      if (!isCompleteSource(source)) {
        buffer = source;
        rl.setPrompt("... ");
        rl.prompt();
        return;
      }

      try {
        const result = await runSource(source, {
          session,
          cwd: options.cwd || process.cwd(),
          sourceName: "<repl>",
        });

        if (shouldEchoResult(source) && result !== null) {
          stdout.write(`${stringifyValue(result)}\n`);
        }
      } catch (error) {
        stderr.write(`${formatError(error, { color })}\n`);
      }

      buffer = "";
      rl.setPrompt("> ");
      rl.prompt();
    };

    rl.on("line", (line) => {
      lineQueue = lineQueue
        .then(() => processLine(line))
        .catch((error) => {
          stderr.write(`${formatError(error, { color })}\n`);
          buffer = "";
          rl.setPrompt("> ");
          rl.prompt();
        });
    });

    rl.on("close", () => {
      stdout.write("Goodbye.\n");
      resolve(0);
    });
  });
}

async function handleLoadCommand(argument, session, options, stdout, stderr, color) {
  const target = argument.trim();
  if (!target) {
    stderr.write("Usage: .load <file>\n");
    return;
  }

  try {
    const filePath = path.resolve(options.cwd || process.cwd(), target);
    await runFile(filePath, {
      session,
      cwd: path.dirname(filePath),
      stdout,
      stderr,
    });
    stdout.write(`Loaded ${target}\n`);
  } catch (error) {
    stderr.write(`${formatError(error, { color })}\n`);
  }
}

async function handleTypeCommand(expressionSource, session, options, stdout, stderr, color) {
  const expression = expressionSource.trim();
  if (!expression) {
    stderr.write("Usage: .type <expression>\n");
    return;
  }

  try {
    const result = await runSource(expression, {
      session,
      cwd: options.cwd || process.cwd(),
      sourceName: "<repl:type>",
    });
    stdout.write(`${describeRuntimeType(result)}\n`);
  } catch (error) {
    stderr.write(`${formatError(error, { color })}\n`);
  }
}

async function handleMemoryCommand(expressionSource, session, options, stdout, stderr, color) {
  const expression = expressionSource.trim();
  if (!expression) {
    stderr.write("Usage: .memory <expression>\n");
    return;
  }

  try {
    const result = await runSource(expression, {
      session,
      cwd: options.cwd || process.cwd(),
      sourceName: "<repl:memory>",
    });
    stdout.write(`${stringifyValue(runtimeValueFromJs(inspectValue(session.interpreter.memoryRegistry, result), { anonymous: true }))}\n`);
  } catch (error) {
    stderr.write(`${formatError(error, { color })}\n`);
  }
}

function printSymbols(session, stdout) {
  const bindings = session.interpreter.environment
    .describeBindings({ includeStdlib: false })
    .sort((left, right) => left.name.localeCompare(right.name));

  if (bindings.length === 0) {
    stdout.write("No user-defined bindings.\n");
    return;
  }

  for (const binding of bindings) {
    const declaredType = binding.declaredType ? stringifyType(binding.declaredType) : "any";
    stdout.write(`${binding.name}: ${declaredType} = ${stringifyValue(binding.value)}\n`);
  }
}

function shouldEchoResult(source) {
  const trimmed = source.trim();
  return !/^(export\s+)?(let|func|class|type|if|loop|return|import|inspect|memory|whyalive|optimize|server|task|test)\b/.test(trimmed);
}

function isCompleteSource(source) {
  let braceDepth = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  let quote = null;
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === quote) {
        quote = null;
      }

      continue;
    }

    if (char === "/" && next === "/") {
      while (index < source.length && source[index] !== "\n") {
        index += 1;
      }
      continue;
    }

    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }

    if (char === "{") {
      braceDepth += 1;
    } else if (char === "}") {
      braceDepth -= 1;
    } else if (char === "(") {
      parenDepth += 1;
    } else if (char === ")") {
      parenDepth -= 1;
    } else if (char === "[") {
      bracketDepth += 1;
    } else if (char === "]") {
      bracketDepth -= 1;
    }
  }

  return braceDepth <= 0 && parenDepth <= 0 && bracketDepth <= 0 && quote === null;
}

module.exports = {
  isCompleteSource,
  startRepl,
};
