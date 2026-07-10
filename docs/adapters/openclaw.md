# OpenClaw Adapter

Adapter ID: `openclaw-cli`  
Runtime: Node.js 22+  
Auto-detected: ✅ Yes  
Status: ✅ Tested

## Overview

The OpenClaw adapter integrates OpenClaw's autonomous agent platform with AMC, capturing all tool calls, sessions, and multi-agent orchestration as signed evidence.

## Prerequisites

- OpenClaw installed (`npm i -g openclaw`)
- AMC installed (`curl -fsSL https://agentmaturity.co/install.sh | sh`)

## Quick Start

```bash
amc adapters run --agent my-openclaw --adapter openclaw-cli -- openclaw run "Build a web scraper"
```

## Setup

### Option 1: Wrap Individual Runs

```bash
amc adapters run --agent my-openclaw --adapter openclaw-cli -- openclaw run "task description"
```

### Option 2: Configure OpenClaw Gateway Routing (Permanent)

Edit OpenClaw's config to route all sessions through AMC:

```yaml
# ~/.openclaw/config.yaml
gateway:
  amcIntegration:
    enabled: true
    baseUrl: http://localhost:3210
    agentId: my-openclaw-agent
```

Then all OpenClaw sessions automatically flow through AMC.

## Evidence Captured

- Session initialization and lifecycle
- Tool calls (exec, read, write, browser, etc.)
- Sub-agent spawns and orchestration
- Model routing and token usage
- Memory operations
- Process lifecycle events

## Common Patterns

### Autonomous Task Execution

```bash
amc adapters run --agent autonomous --adapter openclaw-cli -- \
  openclaw run "Research and summarize the latest AI papers"
```

### With Sub-agents

```bash
amc adapters run --agent orchestrator --adapter openclaw-cli -- \
  openclaw run "Build a multi-agent system for code review"
```

## See Also

- [OpenHands Adapter](openhands.md)
- [Generic CLI Adapter](generic-cli.md)
