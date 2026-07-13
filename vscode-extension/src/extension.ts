import * as vscode from "vscode";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const UNIX_INSTALL_COMMAND = "curl -fsSL https://agentmaturity.co/install.sh | sh";
const WINDOWS_INSTALL_COMMAND = "irm https://agentmaturity.co/install.ps1 | iex";

function installCommand(): string {
  return process.platform === "win32" ? WINDOWS_INSTALL_COMMAND : UNIX_INSTALL_COMMAND;
}

async function ensureAmcCli(): Promise<boolean> {
  try {
    await execFileAsync("amc", ["--version"], { timeout: 5000 });
    return true;
  } catch {
    vscode.window.showErrorMessage(`AMC CLI not found. Install with: ${installCommand()}`);
    return false;
  }
}

async function openAmcTerminal(command: string): Promise<void> {
  if (!(await ensureAmcCli())) return;
  const terminal = vscode.window.createTerminal("AMC");
  terminal.show();
  terminal.sendText(command);
}

export function activate(context: vscode.ExtensionContext) {
  console.log("AMC extension activated");

  // Quick Score command
  context.subscriptions.push(
    vscode.commands.registerCommand("amc.quickscore", async () => {
      await openAmcTerminal("amc quickscore --rapid");
    })
  );

  // Lint command
  context.subscriptions.push(
    vscode.commands.registerCommand("amc.lint", async () => {
      await openAmcTerminal("amc lint");
    })
  );

  // Doctor command
  context.subscriptions.push(
    vscode.commands.registerCommand("amc.doctor", async () => {
      try {
        const { stdout } = await execFileAsync("amc", ["doctor", "--json"], {
          cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
          timeout: 30000,
        });
        const result = JSON.parse(stdout);
        if (result.ok) {
          vscode.window.showInformationMessage("AMC Doctor: All checks passed ✅");
        } else {
          const failed = result.checks?.filter((c: any) => c.status === "FAIL") || [];
          vscode.window.showWarningMessage(
            `AMC Doctor: ${failed.length} issue(s) found. Run 'AMC: Doctor' in terminal for details.`
          );
        }
      } catch {
        vscode.window.showErrorMessage(`AMC Doctor could not run. Verify with 'amc --help' or install with: ${installCommand()}`);
      }
    })
  );

  // Dashboard command
  context.subscriptions.push(
    vscode.commands.registerCommand("amc.dashboard", async () => {
      await openAmcTerminal("amc dashboard open");
    })
  );

  // Status bar item
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.text = "$(shield) AMC";
  statusBar.tooltip = "Agent Maturity Compass";
  statusBar.command = "amc.quickscore";
  statusBar.show();
  context.subscriptions.push(statusBar);
}

export function deactivate() {}
