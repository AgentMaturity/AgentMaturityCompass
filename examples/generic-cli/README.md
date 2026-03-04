# Generic CLI — Score ANY Agent with AMC

Wrap **any** CLI-based AI agent with AMC evidence collection using environment variable proxying.

## What It Does

- Sets all common LLM provider env vars (OpenAI, Anthropic, Gemini, xAI, OpenRouter) to the AMC Gateway
- Works with any agent that reads standard env vars for API configuration
- Zero knowledge of the agent's internals required

## Prerequisites

- AMC CLI installed (`npm i -g agent-maturity-compass`)
- Any CLI-based AI agent

## Run with AMC

### Option 1: Use `amc wrap` (recommended)

```bash
amc up
amc wrap generic-cli -- python my_agent.py
amc wrap generic-cli -- node my_agent.js
amc wrap generic-cli -- ./my-custom-agent --flag value
```

### Option 2: Use the wrapper script

```bash
amc up
chmod +x score-my-agent.sh
./score-my-agent.sh python my_agent.py
./score-my-agent.sh ./my-custom-agent --verbose
```

## Expected Output

```
[AMC] Wrapping command: python my_agent.py
[AMC] Gateway URL: http://localhost:3700
[AMC] Environment configured — all LLM calls will be captured.
─────────────────────────────────────────────────────
<your agent's normal output>
```

## Supported Environment Variables

The generic adapter sets these env vars to the AMC Gateway:

| Provider | Variables |
|----------|-----------|
| OpenAI | `OPENAI_BASE_URL`, `OPENAI_API_BASE`, `OPENAI_API_HOST` |
| Anthropic | `ANTHROPIC_BASE_URL`, `ANTHROPIC_API_URL` |
| Gemini | `GEMINI_BASE_URL` |
| xAI | `XAI_BASE_URL` |
| OpenRouter | `OPENROUTER_BASE_URL` |
| Generic | `AMC_LLM_BASE_URL` |

## How AMC Integrates

The `generic-cli` adapter is the catch-all. It sets every known provider's base URL env var to the AMC Gateway, plus HTTP/HTTPS proxy settings. Any agent that reads standard env vars for LLM configuration will automatically route through AMC.

The adapter definition is in `src/adapters/builtins/genericCli.ts`.
