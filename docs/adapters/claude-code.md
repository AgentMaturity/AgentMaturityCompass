# Claude Code Adapter

Adapter ID: `claude-cli`  
Runtime: Native binary  
Auto-detected: ✅ Yes  
Status: ✅ Tested

## Overview

The Claude Code adapter wraps Anthropic's official Claude CLI, capturing all interactions, reasoning traces, and tool usage as signed AMC evidence.

## Prerequisites

- Claude CLI installed (`brew install anthropic/claude/claude` or download from Anthropic)
- AMC installed (`curl -fsSL https://agentmaturity.co/install.sh | sh`)

## Quick Start

```bash
amc adapters run --agent my-claude --adapter claude-cli -- claude "Analyze this codebase"
```

## Setup

```bash
amc adapters configure \
  --agent my-claude \
  --adapter claude-cli \
  --route /anthropic \
  --model claude-sonnet-4-6
```

## Environment Variables Injected

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Lease token (routed through AMC gateway) |
| `ANTHROPIC_BASE_URL` | AMC gateway URL |
| `AMC_AGENT_ID` | Agent identifier |
| `AMC_LEASE_TOKEN` | Short-lived run lease |

## Evidence Captured

- Claude model interactions (input/output tokens, latency)
- Extended thinking traces (when enabled)
- Tool calls and results
- File operations and code edits
- Process lifecycle events
- Error traces

## Common Patterns

### Code Analysis

```bash
amc adapters run --agent code-reviewer --adapter claude-cli -- \
  claude --model claude-opus-4-6 "Review this PR for security issues"
```

### With Extended Thinking

```bash
amc adapters run --agent deep-thinker --adapter claude-cli -- \
  claude --thinking extended "Solve this complex problem"
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `claude: command not found` | Install Claude CLI: `brew install anthropic/claude/claude` |
| API key conflict | AMC overrides `ANTHROPIC_API_KEY` with the lease token |
| Gateway connection refused | Ensure `amc up` is running |

## See Also

- [Gemini Adapter](gemini.md)
- [OpenClaw Adapter](openclaw.md)
