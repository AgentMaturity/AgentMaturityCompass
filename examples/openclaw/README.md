# OpenClaw + AMC

Configure an OpenClaw agent with AMC maturity scoring enabled.

## What It Does

- Shows how to configure OpenClaw to route LLM calls through the AMC Gateway
- AMC captures all agent interactions, tool usage, and error handling
- Purely configuration-based — no code changes needed

## Prerequisites

- OpenClaw installed (`npm i -g openclaw`)
- AMC CLI installed (`npm i -g agent-maturity-compass`)
- An OpenAI API key (or any supported provider)

## Run with AMC

```bash
# Start AMC Gateway
amc up

# Run OpenClaw through AMC
amc wrap openclaw-cli -- openclaw run

# Or manually set env vars
export OPENAI_BASE_URL=$(amc gateway-url)
export OPENAI_API_KEY=sk-...
openclaw run
```

## Expected Behavior

OpenClaw runs normally while AMC transparently captures:
- All LLM API calls (prompts, completions, token usage)
- Tool/skill invocations and results
- Error handling and recovery patterns
- Multi-turn conversation flows

## How AMC Integrates

OpenClaw uses OpenAI-compatible clients that read `OPENAI_BASE_URL` from the environment. AMC's `openclaw-cli` adapter sets this (plus `OPENAI_API_KEY`, `HTTP_PROXY`, `HTTPS_PROXY`) to route through the gateway.

The `config.yaml` in this example shows optional AMC metadata that can be included in your OpenClaw configuration.

The adapter definition is in `src/adapters/builtins/openclawCli.ts`.
