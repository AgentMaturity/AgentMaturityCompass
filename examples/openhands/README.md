# OpenHands + AMC

Score OpenHands (formerly OpenDevin) coding agent sessions with AMC evidence collection.

## What It Does

- Configures environment variables so OpenHands routes API calls through the AMC Gateway
- AMC captures all LLM interactions during coding tasks
- Works with both CLI and Docker-based OpenHands deployments

## Prerequisites

- OpenHands installed ([github.com/All-Hands-AI/OpenHands](https://github.com/All-Hands-AI/OpenHands))
- AMC CLI installed (`npm i -g agent-maturity-compass`)
- An OpenAI API key

## Quick Start

### Option 1: Use `amc wrap` (recommended)

```bash
amc up
amc wrap openhands-cli -- openhands "Fix the type error in utils.ts"
```

### Option 2: Source the setup script

```bash
amc up
source setup.sh
openhands "Fix the type error in utils.ts"
```

### Option 3: Docker

```bash
amc up
docker run \
  -e OPENAI_BASE_URL=http://host.docker.internal:3700/v1 \
  -e OPENAI_API_KEY=$OPENAI_API_KEY \
  ghcr.io/all-hands-ai/openhands:latest
```

## Expected Output

```
[AMC] Configuring OpenHands for AMC evidence collection
[AMC] Gateway URL: http://localhost:3700
[AMC] Environment configured. Run OpenHands normally.
```

OpenHands then runs its coding agent normally, with all API calls captured by AMC.

## How AMC Integrates

OpenHands uses OpenAI-compatible clients that read `OPENAI_BASE_URL` from the environment. AMC's `openhands-cli` adapter sets this plus `OPENAI_API_BASE` and `OPENAI_API_HOST` for maximum compatibility.

The adapter definition is in `src/adapters/builtins/openhandsCli.ts`.
