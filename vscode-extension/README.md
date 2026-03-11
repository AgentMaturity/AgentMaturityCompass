# AMC VS Code Extension

VS Code extension for Agent Maturity Compass (AMC) that provides inline maturity score display, red/green indicators, evaluation runner, results panel, and amcconfig.yaml schema validation.

## Features

- **Inline Score Display**: Shows maturity scores directly in your code editor
- **Red/Green Indicators**: Visual indicators for code quality and maturity issues
- **Run Evaluation**: Execute AMC evaluations directly from VS Code
- **Results Panel**: View detailed evaluation results in a dedicated panel
- **Schema Validation**: YAML schema validation for `amcconfig.yaml` files
- **Quick Fixes**: Apply suggested fixes for common maturity issues

## Commands

- `AMC: Refresh Score` - Refresh the maturity score for the current file
- `AMC: Run Evaluation` - Run a full AMC evaluation on the workspace
- `AMC: Apply Quick Fix` - Apply suggested fixes for detected issues

## Configuration

- `amc.enableInlineScores`: Enable/disable inline score display (default: true)
- `amc.configPath`: Path to AMC configuration file (default: "amcconfig.yaml")

## Requirements

- AMC CLI tool must be installed and available in PATH or in local node_modules
- VS Code 1.74.0 or higher

## Installation

1. Install the AMC CLI: `npm install -g agent-maturity-compass`
2. Install this extension from the VS Code marketplace
3. Open a project with AMC configuration
4. The extension will automatically activate for supported file types

## Usage

1. Open a TypeScript, JavaScript, or Python file
2. The extension will automatically analyze the file and show scores in the status bar
3. Use `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac) and search for "AMC" commands
4. View detailed results in the AMC Results panel in the Explorer sidebar

## Supported File Types

- TypeScript (.ts)
- JavaScript (.js)
- Python (.py)
- YAML (.yaml, .yml)
- JSON (.json)
