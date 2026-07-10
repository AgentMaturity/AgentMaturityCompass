# Semantic Kernel Adapter

Adapter ID: `semantic-kernel`  
Runtime: Node.js 22+ or .NET 8+  
Auto-detected: ✅ Yes  
Status: ✅ Tested

## Overview

Microsoft's Semantic Kernel is an SDK for integrating LLMs with conventional programming languages. The AMC adapter captures kernel execution, plugin invocations, and planner operations.

## Prerequisites

- Node.js 22+ (for TypeScript/JavaScript) or .NET 8+ (for C#)
- `@microsoft/semantic-kernel` npm package (Node.js)
- AMC installed (`curl -fsSL https://agentmaturity.co/install.sh | sh`)

## Quick Start

```bash
amc adapters run --agent my-kernel --adapter semantic-kernel -- node kernel_agent.js
```

## Setup

```bash
amc adapters configure \
  --agent my-kernel \
  --adapter semantic-kernel \
  --route /openai
```

## SDK Integration (Node.js)

```typescript
import { Kernel, OpenAIChatCompletion } from "@microsoft/semantic-kernel";

const kernel = new Kernel();

const chatCompletion = new OpenAIChatCompletion({
  modelId: "gpt-4o",
  apiKey: process.env.OPENAI_API_KEY,  // AMC lease token
  endpoint: process.env.OPENAI_BASE_URL,  // AMC gateway
});

kernel.addService(chatCompletion);

const result = await kernel.invokePromptAsync("Explain agent maturity levels");
```

## Evidence Captured

- Kernel initialization
- Plugin registration and invocation
- Planner execution steps
- LLM calls and responses
- Function calling sequences
- Memory operations

## See Also

- [LlamaIndex Adapter](llamaindex.md)
- [OpenAI Agents SDK Adapter](openai-agents-sdk.md)
