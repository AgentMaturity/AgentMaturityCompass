# Claude Code CLI + AMC

Score Claude Code CLI sessions with AMC evidence collection.

## What It Does

- Configures environment variables so Claude Code routes API calls through the AMC Gateway
- AMC transparently captures all Anthropic API interactions
- No modifications to Claude Code itself — purely env var based

## Prerequisites

- Claude Code CLI installed (`npm i -g @anthropic-ai/claude-code`)
- AMC CLI installed (`npm i -g agent-maturity-compass`)
- An Anthropic API key

## Quick Start

### Option 1: Use `amc wrap` (recommended)

```bash
amc up
amc wrap claude-cli -- claude "Explain quantum computing in 3 sentences"
```

### Option 2: Source the setup script

```bash
amc up
source setup.sh
claude "Explain quantum computing in 3 sentences"
```

## Expected Output

```
[AMC] Configuring Claude Code CLI for AMC evidence collection
[AMC] Gateway URL: http://localhost:3700
[AMC] Environment configured. Run Claude Code normally.
```

Then Claude Code runs as usual, with all API calls captured by AMC.

## How AMC Integrates

Claude Code reads `ANTHROPIC_BASE_URL` and `ANTHROPIC_API_KEY` from the environment. AMC's `claude-cli` adapter sets these to the AMC Gateway endpoint. The adapter also supports `ANTHROPIC_API_URL` and `X_API_KEY` as fallbacks.

The adapter definition is in `src/adapters/builtins/claudeCli.ts`.
