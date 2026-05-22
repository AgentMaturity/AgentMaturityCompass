"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = require("vscode");
const child_process_1 = require("child_process");
const util_1 = require("util");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
function activate(context) {
    console.log("AMC extension activated");
    // Quick Score command
    context.subscriptions.push(vscode.commands.registerCommand("amc.quickscore", async () => {
        const terminal = vscode.window.createTerminal("AMC");
        terminal.show();
        terminal.sendText("npx agent-maturity-compass quickscore --rapid");
    }));
    // Lint command
    context.subscriptions.push(vscode.commands.registerCommand("amc.lint", async () => {
        const terminal = vscode.window.createTerminal("AMC");
        terminal.show();
        terminal.sendText("npx agent-maturity-compass lint");
    }));
    // Doctor command
    context.subscriptions.push(vscode.commands.registerCommand("amc.doctor", async () => {
        try {
            const { stdout } = await execAsync("npx agent-maturity-compass doctor --json", {
                cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
                timeout: 30000,
            });
            const result = JSON.parse(stdout);
            if (result.ok) {
                vscode.window.showInformationMessage("AMC Doctor: All checks passed ✅");
            }
            else {
                const failed = result.checks?.filter((c) => c.status === "FAIL") || [];
                vscode.window.showWarningMessage(`AMC Doctor: ${failed.length} issue(s) found. Run 'AMC: Doctor' in terminal for details.`);
            }
        }
        catch {
            vscode.window.showErrorMessage("AMC not found. Install with: npm i -g agent-maturity-compass");
        }
    }));
    // Dashboard command
    context.subscriptions.push(vscode.commands.registerCommand("amc.dashboard", async () => {
        const terminal = vscode.window.createTerminal("AMC");
        terminal.show();
        terminal.sendText("npx agent-maturity-compass dashboard open");
    }));
    // Status bar item
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBar.text = "$(shield) AMC";
    statusBar.tooltip = "Agent Maturity Compass";
    statusBar.command = "amc.quickscore";
    statusBar.show();
    context.subscriptions.push(statusBar);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map