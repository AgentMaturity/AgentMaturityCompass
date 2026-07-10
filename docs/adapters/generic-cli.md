# Generic CLI Adapter

Adapter ID: `generic-cli`  
Runtime: sh/bash  
Auto-detected: ✅ Yes  
Status: ✅ Tested

## Overview

The generic CLI adapter is the universal fallback for any command-line agent. It captures stdout, stderr, exit codes, and process lifecycle as signed evidence, without requiring framework-specific integration.

## Prerequisites

- Any executable agent (shell script, binary, Python script, Node.js app, etc.)
- AMC installed (`curl -fsSL https://agentmaturity.co/install.sh | sh`)

## Quick Start

```bash
amc adapters run --agent my-agent --adapter generic-cli -- ./my-custom-agent.sh
amc adapters run --agent my-agent --adapter generic-cli -- python bot.py
amc adapters run --agent my-agent --adapter generic-cli -- node agent.js
amc adapters run --agent my-agent --adapter generic-cli -- /usr/local/bin/my-agent
```

## Setup

```bash
amc adapters configure \
  --agent my-agent \
  --adapter generic-cli
```

## How It Works

The generic adapter:
1. Spawns your command as a child process
2. Captures all stdout and stderr
3. Records start time, end time, and exit code
4. Signs all output as tamper-evident evidence
5. Stores evidence in the AMC receipts ledger

## Environment Variables Injected

| Variable | Description |
|----------|-------------|
| `AMC_AGENT_ID` | Your agent identifier |
| `AMC_LEASE_TOKEN` | Short-lived lease for this run |
| `AMC_GATEWAY_URL` | Gateway base URL (if your agent needs it) |

## Evidence Captured

- Process start event with command and arguments
- All stdout output (line-by-line)
- All stderr output (line-by-line)
- Exit code and termination reason
- Execution duration
- Environment snapshot (redacted secrets)

## Common Patterns

### Shell Script Agent

```bash
amc adapters run --agent shell-bot --adapter generic-cli -- ./agent.sh --task "analyze logs"
```

### Python Script

```bash
amc adapters run --agent py-bot --adapter generic-cli -- python agent.py --config config.json
```

### Compiled Binary

```bash
amc adapters run --agent native-bot --adapter generic-cli -- /usr/local/bin/my-agent --verbose
```

### With Arguments

```bash
amc adapters run --agent my-agent --adapter generic-cli -- \
  node agent.js --model gpt-4o --task "code review"
```

## When to Use

Use the generic CLI adapter when:
- Your agent doesn't have a framework-specific adapter
- You want quick evidence capture without code changes
- You're prototyping or testing a new agent
- You need a universal fallback

For deeper instrumentation (LLM call details, tool usage, etc.), use a framework-specific adapter or the [Python SDK](python-amc-sdk.md).

## Limitations

- No LLM call details (tokens, model, latency) unless your agent logs them to stdout
- No structured tool call capture
- No automatic API key routing (your agent must handle its own keys)

For richer evidence, consider:
- Adding AMC SDK integration to your agent
- Using a framework-specific adapter if available
- Logging structured JSON to stdout for post-processing

## See Also

- [Python AMC SDK Adapter](python-amc-sdk.md)
- [OpenClaw Adapter](openclaw.md)
- [Adapter Architecture](../ADAPTERS.md)
