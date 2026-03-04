# Semantic Kernel (.NET) + AMC

A .NET Semantic Kernel agent with function calling, routed through the AMC Gateway.

## What It Does

- Creates a Semantic Kernel with a **MathPlugin** (multiply, add)
- Uses auto function calling to solve math problems
- AMC captures all LLM calls and tool invocations via the gateway

## Prerequisites

- .NET 8.0 SDK
- AMC CLI installed (`npm i -g agent-maturity-compass`)
- An OpenAI API key

## Install

```bash
cd examples/semantic-kernel
dotnet restore
```

## Run with AMC

```bash
amc up

# Set env vars and run
export OPENAI_BASE_URL=$(amc gateway-url)
export OPENAI_API_KEY=sk-...
dotnet run

# Or use amc wrap with generic-cli adapter
amc wrap generic-cli -- dotnet run --project examples/semantic-kernel
```

## Expected Output

```
[AMC] Routing LLM calls through gateway: http://localhost:3700/v1
=== Semantic Kernel Agent ===
Response: 42 × 17 = 714. I verified this using the calculator.
[AMC] All LLM calls captured as evidence via gateway proxy.
```

## How AMC Integrates

Semantic Kernel's `AddOpenAIChatCompletion` accepts a custom `endpoint` parameter. The example reads `OPENAI_BASE_URL` (set by AMC) and passes it as the endpoint. Function calls (plugins) are also captured as evidence.

The adapter definition is in `src/adapters/builtins/semanticKernel.ts`.
