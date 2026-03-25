# AMC VS Code Extension

Inline Agent Maturity Compass integration for Visual Studio Code.

## Features

- **AMC: Quick Score** — Run rapid trust scoring from the command palette
- **AMC: Lint** — Lint agent configuration files for best practices
- **AMC: Doctor** — Health check with inline notifications
- **AMC: Dashboard** — Open the AMC dashboard in your browser
- **Status bar** — Quick access to scoring from the bottom bar

## Requirements

- [Agent Maturity Compass](https://github.com/thewisecrab/AgentMaturityCompass) installed (`npm i -g agent-maturity-compass`)
- A workspace with `.amc/` directory (run `amc init` first)

## Status

🚧 **Scaffold** — This extension provides basic command palette integration. Future versions will add:
- Inline diagnostics (red squiggles for config issues)
- CodeLens showing trust scores on agent files
- Sidebar panel with maturity dashboard
- Real-time assurance results
