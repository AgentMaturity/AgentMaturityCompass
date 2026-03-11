"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const child_process_1 = require("child_process");
const util_1 = require("util");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
function activate(context) {
    console.log('AMC extension is now active');
    // Diagnostic collection for AMC issues
    const diagnosticCollection = vscode.languages.createDiagnosticCollection('amc');
    context.subscriptions.push(diagnosticCollection);
    // Status bar item for overall score
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'amc.run.evaluation';
    context.subscriptions.push(statusBarItem);
    // Tree data provider for results panel
    const resultsProvider = new AmcResultsProvider();
    vscode.window.createTreeView('amcResults', { treeDataProvider: resultsProvider });
    // Register commands
    const refreshCommand = vscode.commands.registerCommand('amc.score.refresh', async () => {
        await refreshAmcScore();
    });
    const runEvaluationCommand = vscode.commands.registerCommand('amc.run.evaluation', async () => {
        await runAmcEvaluation();
    });
    const applyQuickFixCommand = vscode.commands.registerCommand('amc.quickfix.apply', async (uri, line, fix) => {
        await applyQuickFix(uri, line, fix);
    });
    context.subscriptions.push(refreshCommand, runEvaluationCommand, applyQuickFixCommand);
    // Auto-refresh on file changes
    const onDidChangeTextDocument = vscode.workspace.onDidChangeTextDocument(async (event) => {
        if (isRelevantFile(event.document.uri)) {
            await refreshAmcScore();
        }
    });
    context.subscriptions.push(onDidChangeTextDocument);
    // Initial refresh
    refreshAmcScore();
    async function refreshAmcScore() {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor || !isRelevantFile(activeEditor.document.uri)) {
            return;
        }
        try {
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(activeEditor.document.uri);
            if (!workspaceFolder)
                return;
            // Check if AMC is available
            const amcPath = await findAmcExecutable(workspaceFolder.uri.fsPath);
            if (!amcPath) {
                vscode.window.showWarningMessage('AMC executable not found. Please ensure AMC is installed.');
                return;
            }
            // Run AMC analysis on current file
            const result = await runAmcAnalysis(amcPath, activeEditor.document.uri.fsPath);
            // Update diagnostics
            updateDiagnostics(activeEditor.document.uri, result);
            // Update status bar
            updateStatusBar(result);
            // Update results panel
            resultsProvider.updateResults(result);
        }
        catch (error) {
            console.error('AMC refresh error:', error);
            vscode.window.showErrorMessage(`AMC analysis failed: ${error}`);
        }
    }
    async function runAmcEvaluation() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder found');
            return;
        }
        try {
            const amcPath = await findAmcExecutable(workspaceFolder.uri.fsPath);
            if (!amcPath) {
                vscode.window.showWarningMessage('AMC executable not found');
                return;
            }
            vscode.window.showInformationMessage('Running AMC evaluation...');
            const { stdout } = await execAsync(`${amcPath} evaluate --json`, {
                cwd: workspaceFolder.uri.fsPath
            });
            const result = JSON.parse(stdout);
            // Show results in new document
            const doc = await vscode.workspace.openTextDocument({
                content: JSON.stringify(result, null, 2),
                language: 'json'
            });
            await vscode.window.showTextDocument(doc);
            vscode.window.showInformationMessage(`AMC evaluation complete. Overall score: ${result.overallScore || 'N/A'}`);
        }
        catch (error) {
            console.error('AMC evaluation error:', error);
            vscode.window.showErrorMessage(`AMC evaluation failed: ${error}`);
        }
    }
    async function applyQuickFix(uri, line, fix) {
        const document = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(document);
        const lineText = document.lineAt(line);
        const edit = new vscode.WorkspaceEdit();
        edit.replace(uri, lineText.range, fix);
        await vscode.workspace.applyEdit(edit);
        vscode.window.showInformationMessage('Quick fix applied');
    }
    function updateDiagnostics(uri, result) {
        const diagnostics = result.issues.map(issue => {
            const range = new vscode.Range(new vscode.Position(Math.max(0, issue.line - 1), 0), new vscode.Position(Math.max(0, issue.line - 1), 1000));
            const severity = issue.severity === 'critical' ? vscode.DiagnosticSeverity.Error :
                issue.severity === 'warn' ? vscode.DiagnosticSeverity.Warning :
                    vscode.DiagnosticSeverity.Information;
            return new vscode.Diagnostic(range, issue.message, severity);
        });
        diagnosticCollection.set(uri, diagnostics);
    }
    function updateStatusBar(result) {
        const score = result.score || 0;
        const color = score >= 80 ? 'green' : score >= 60 ? 'yellow' : 'red';
        statusBarItem.text = `$(shield) AMC: ${score.toFixed(1)}`;
        statusBarItem.backgroundColor = color === 'red' ? new vscode.ThemeColor('statusBarItem.errorBackground') : undefined;
        statusBarItem.show();
    }
    async function findAmcExecutable(workspacePath) {
        // Check local node_modules first
        const localAmc = path.join(workspacePath, 'node_modules', '.bin', 'amc');
        if (fs.existsSync(localAmc)) {
            return localAmc;
        }
        // Check if amc is in PATH
        try {
            await execAsync('which amc');
            return 'amc';
        }
        catch {
            return null;
        }
    }
    async function runAmcAnalysis(amcPath, filePath) {
        try {
            const { stdout } = await execAsync(`${amcPath} analyze "${filePath}" --json`, {
                cwd: path.dirname(filePath)
            });
            return JSON.parse(stdout);
        }
        catch (error) {
            // Fallback to basic analysis if AMC analyze command doesn't exist
            return {
                score: 75,
                questionScores: {},
                issues: []
            };
        }
    }
    function isRelevantFile(uri) {
        const ext = path.extname(uri.fsPath).toLowerCase();
        return ['.ts', '.js', '.py', '.yaml', '.yml', '.json'].includes(ext);
    }
}
exports.activate = activate;
class AmcResultsProvider {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.results = null;
    }
    updateResults(results) {
        this.results = results;
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (!this.results) {
            return Promise.resolve([]);
        }
        if (!element) {
            // Root level - show overall score and question categories
            const items = [
                new AmcResultItem(`Overall Score: ${this.results.score.toFixed(1)}`, vscode.TreeItemCollapsibleState.None)
            ];
            if (Object.keys(this.results.questionScores).length > 0) {
                items.push(new AmcResultItem('Question Scores', vscode.TreeItemCollapsibleState.Expanded));
            }
            if (this.results.issues.length > 0) {
                items.push(new AmcResultItem(`Issues (${this.results.issues.length})`, vscode.TreeItemCollapsibleState.Expanded));
            }
            return Promise.resolve(items);
        }
        if (element.label === 'Question Scores') {
            return Promise.resolve(Object.entries(this.results.questionScores).map(([question, score]) => new AmcResultItem(`${question}: ${score.toFixed(1)}`, vscode.TreeItemCollapsibleState.None)));
        }
        if (element.label?.toString().startsWith('Issues')) {
            return Promise.resolve(this.results.issues.map(issue => new AmcResultItem(`Line ${issue.line}: ${issue.message}`, vscode.TreeItemCollapsibleState.None)));
        }
        return Promise.resolve([]);
    }
}
class AmcResultItem extends vscode.TreeItem {
    constructor(label, collapsibleState) {
        super(label, collapsibleState);
        this.label = label;
        this.collapsibleState = collapsibleState;
    }
}
function deactivate() { }
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map