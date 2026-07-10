# Gemini CLI Adapter

Adapter ID: `gemini-cli`  
Runtime: Native binary  
Auto-detected: ✅ Yes  
Status: ✅ Tested

## Overview

The Gemini CLI adapter wraps Google's Gemini command-line interface, capturing model interactions, safety scores, grounding citations, and multimodal inputs.

## Prerequisites

- Gemini CLI installed
- AMC installed (`curl -fsSL https://agentmaturity.co/install.sh | sh`)

## Quick Start

```bash
amc adapters run --agent my-gemini --adapter gemini-cli -- gemini "Explain quantum computing"
```

## Setup

```bash
amc adapters configure \
  --agent my-gemini \
  --adapter gemini-cli \
  --route /gemini \
  --model gemini-2.0-flash-exp
```

## Environment Variables Injected

| Variable | Description |
|----------|-------------|
| `GOOGLE_API_KEY` | Lease token (routed through AMC gateway) |
| `GEMINI_BASE_URL` | AMC gateway URL |
| `AMC_AGENT_ID` | Agent identifier |

## Evidence Captured

- Model responses and token usage
- Safety ratings (hate, harassment, dangerous content, etc.)
- Grounding citations and search hits
- Multimodal inputs (images, video, audio)
- Function calling sequences
- Process lifecycle events

## Common Patterns

### With Grounding

```bash
amc adapters run --agent grounded-gemini --adapter gemini-cli -- \
  gemini --grounding "What are the latest AI safety regulations?"
```

### Multimodal Analysis

```bash
amc adapters run --agent vision-agent --adapter gemini-cli -- \
  gemini --image screenshot.png "Describe this UI"
```

## See Also

- [Claude Code Adapter](claude-code.md)
- [OpenAI Agents SDK Adapter](openai-agents-sdk.md)
