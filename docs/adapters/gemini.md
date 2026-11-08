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

## Hooks (what AMC claims)

`amc connect hooks install --provider gemini-cli` writes two command hooks into the project's `.gemini/settings.json`.
The default (`--mode observe`) forwards `BeforeTool` and `AfterTool` as observations only and returns no decision; AMC
records the call's digests. With `--mode control`, `BeforeTool` answers `{"decision":"allow"}` or
`{"decision":"deny","reason":...}` from the signed policy (a `run_shell_command` call is parsed into a command plan
first). The hooks follow decision D55: a hook can deny or observe, never allow past the policy or rewrite arguments.

What AMC claims, from `docs/adapters/manifests/gemini-cli.json` (rendered in [SUPPORT_MATRIX.md](SUPPORT_MATRIX.md)):

- `AfterTool`: observed. Qualified versions: none.
- `BeforeTool`: **not claimed as enforcement.** The Bridge registers no Gemini CLI session and binds no authorization
  record to the answer, so a deny is advisory, and AMC has no recorded run of a pinned Gemini CLI binary. Until a
  qualification record exists the matrix lists Gemini CLI as "observe only, no qualified version".

## See Also

- [Claude Code Adapter](claude-code.md)
- [OpenAI Agents SDK Adapter](openai-agents-sdk.md)
