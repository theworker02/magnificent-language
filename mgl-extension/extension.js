"use strict";

const fs = require("fs");
const path = require("path");
const vscode = require("vscode");

function activate(context) {
  const output = vscode.window.createOutputChannel("MGL");
  context.subscriptions.push(output);

  context.subscriptions.push(
    vscode.commands.registerCommand("mgl.runFile", async () => {
      const editor = vscode.window.activeTextEditor;

      if (!editor || editor.document.languageId !== "mgl") {
        vscode.window.showWarningMessage("Open an .mgl file to run it.");
        return;
      }

      await editor.document.save();
      const terminal = getTerminal();
      const cliCommand = getCliCommand(context, output);
      if (!cliCommand) {
        return;
      }
      const filePath = editor.document.uri.fsPath;

      terminal.show(true);
      output.appendLine(`Running: ${cliCommand} run ${quote(filePath)}`);
      terminal.sendText(`${cliCommand} run ${quote(filePath)}`, true);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("mgl.openRepl", () => {
      const terminal = getTerminal();
      const cliCommand = getCliCommand(context, output);
      if (!cliCommand) {
        return;
      }

      terminal.show(true);
      output.appendLine(`Running: ${cliCommand} repl`);
      terminal.sendText(`${cliCommand} repl`, true);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("mgl.initProject", async () => {
      const workspaceDirectory = getWorkspaceDirectory();
      const projectName = await vscode.window.showInputBox({
        prompt: "Enter a folder name for the new MGL project",
        placeHolder: "demo-app",
        validateInput(value) {
          if (!value || !value.trim()) {
            return "Project name is required.";
          }

          if (/[<>:"|?*]/.test(value)) {
            return "Use a simple folder name without reserved path characters.";
          }

          return null;
        },
      });

      if (!projectName) {
        return;
      }

      const terminal = getTerminal();
      const cliCommand = getCliCommand(context, output);
      if (!cliCommand) {
        return;
      }

      const targetDirectory = path.join(workspaceDirectory, projectName.trim());
      terminal.show(true);
      output.appendLine(`Running: ${cliCommand} init ${quote(targetDirectory)}`);
      terminal.sendText(`${cliCommand} init ${quote(targetDirectory)}`, true);
      vscode.window.showInformationMessage(`Initializing MGL project in ${targetDirectory}`);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("mgl.insertMainTemplate", async () => {
      const editor = vscode.window.activeTextEditor;

      if (!editor || editor.document.languageId !== "mgl") {
        vscode.window.showWarningMessage("Open an .mgl file to insert the main template.");
        return;
      }

      const snippet = new vscode.SnippetString(
        [
          "func main() {",
          "\t$1",
          "}",
          "",
          "main()",
        ].join("\n"),
      );

      await editor.insertSnippet(snippet);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("mgl.insertImportStatement", async () => {
      const editor = vscode.window.activeTextEditor;

      if (!editor || editor.document.languageId !== "mgl") {
        vscode.window.showWarningMessage("Open an .mgl file to insert an import statement.");
        return;
      }

      const snippet = new vscode.SnippetString('import "${1:./module.mgl}"');
      await editor.insertSnippet(snippet);
    }),
  );

  context.subscriptions.push(
    vscode.languages.setLanguageConfiguration("mgl", {
      onEnterRules: [
        {
          beforeText: /^.*\{\s*$/,
          action: { indentAction: vscode.IndentAction.Indent }
        }
      ]
    }),
  );
}

function deactivate() {}

function getCliCommand(context, output) {
  const configuredCliPath = vscode.workspace.getConfiguration("magnificentLanguage").get("cliPath", "mgl").trim();

  if (configuredCliPath && configuredCliPath !== "mgl") {
    return formatCommandPart(configuredCliPath);
  }

  const localCli = findLocalCli(context);
  if (localCli) {
    const cwd = getWorkspaceDirectory();
    const relativeCli = normalizeForShell(path.relative(cwd, localCli) || localCli);
    return `node ${formatCommandPart(relativeCli)}`;
  }

  if (configuredCliPath) {
    const message = "MGL CLI not found in this workspace. Install it globally or set magnificentLanguage.cliPath.";
    output.appendLine(message);
    vscode.window.showWarningMessage(message);
    return null;
  }

  return "mgl";
}

function getTerminal() {
  const name = vscode.workspace.getConfiguration("magnificentLanguage").get("terminalName", "MGL");
  const existing = vscode.window.terminals.find((terminal) => terminal.name === name);

  if (existing) {
    return existing;
  }

  const cwd = getWorkspaceDirectory();
  return vscode.window.createTerminal({
    name,
    cwd,
  });
}

function getWorkspaceDirectory() {
  const workspaceFolder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
  if (workspaceFolder) {
    return workspaceFolder.uri.fsPath;
  }

  const activeFile = vscode.window.activeTextEditor?.document.uri.fsPath;
  return activeFile ? path.dirname(activeFile) : process.cwd();
}

function findLocalCli(context) {
  const candidates = [
    path.join(getWorkspaceDirectory(), "bin", "mgl"),
    path.join(context.extensionPath, "..", "..", "bin", "mgl"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function quote(value) {
  return formatCommandPart(value);
}

function formatCommandPart(value) {
  const text = String(value);

  if (!needsQuoting(text)) {
    return text;
  }

  if (process.platform === "win32") {
    return `"${text.replace(/"/g, '\\"')}"`;
  }

  return `'${text.replace(/'/g, `'\\''`)}'`;
}

function normalizeForShell(value) {
  return process.platform === "win32" ? value.replace(/\//g, "\\") : value;
}

function needsQuoting(value) {
  return /\s|["'`$&|<>();]/.test(value);
}

module.exports = {
  activate,
  deactivate,
};
