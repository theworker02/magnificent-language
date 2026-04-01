const readline = require("readline");

const { createSession, runSource, version } = require("../index");
const { stringifyValue } = require("../runtime/values");
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

  stdout.write(`Magnificent Language REPL v${version}\n`);
  stdout.write("Type .help for commands and .exit to quit.\n");
  rl.setPrompt("> ");
  rl.prompt();

  return new Promise((resolve) => {
    rl.on("line", (line) => {
      const trimmed = line.trim();

      if (!buffer && trimmed === ".exit") {
        rl.close();
        return;
      }

      if (!buffer && trimmed === ".help") {
        stdout.write(".help  Show REPL commands\n");
        stdout.write(".reset Reset the current session\n");
        stdout.write(".exit  Exit the REPL\n");
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
        const result = runSource(source, {
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
    });

    rl.on("close", () => {
      stdout.write("Goodbye.\n");
      resolve(0);
    });
  });
}

function shouldEchoResult(source) {
  const trimmed = source.trim();
  return !/^(let|func|class|if|loop|return|import)\b/.test(trimmed);
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
