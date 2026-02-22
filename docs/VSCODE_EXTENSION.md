# AMC VS Code Extension Scaffold

This scaffold lives in `src/vscode/` and is designed to be copied into a real VS Code extension host package.

## Goals

1. Show AMC question scores inline in code.
2. Highlight code patterns that degrade specific AMC questions.
3. Offer quick-fix suggestions for common maturity gaps.

## Scaffold modules

- `src/vscode/patternCatalog.ts`
  - AMC-aware static rules (question ID, severity, score impact, quick-fix ID).
- `src/vscode/patternScanner.ts`
  - Line-level scanner that finds score-impacting patterns.
- `src/vscode/inlineScore.ts`
  - Converts pattern matches into inline score annotations.
- `src/vscode/quickFixes.ts`
  - Maps findings to quick-fix suggestions.
- `src/vscode/extensionScaffold.ts`
  - Integration layer for editor hooks (`onDocumentChanged`, `refresh` command IDs).

## Example integration flow

1. On file open/change, call `analyzeSourceForAmcVscode(documentText)`.
2. Render `inlineScoreAnnotations` as decorations.
3. Render `matches` as diagnostics linked to AMC question IDs.
4. Expose `quickFixes` as code actions.

## Pattern-to-question examples

- Hardcoded secrets -> `AMC-3.2.3`
- Shell command execution without guard -> `AMC-4.1`
- `fetch()` without timeout -> `AMC-4.5`
- `JSON.parse()` without schema validation -> `AMC-5.1`

## Suggested next implementation step

Create a dedicated extension package (for example, `extensions/amc-vscode`) and wire these scaffold functions into:

- `vscode.languages.createDiagnosticCollection`
- `vscode.window.createTextEditorDecorationType`
- `vscode.languages.registerCodeActionsProvider`

