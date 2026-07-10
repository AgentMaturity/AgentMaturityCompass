# OpenAI Agents SDK Adapter

Adapter ID: `openai-agents-sdk`  
Runtime: Node.js 22+  
Auto-detected: ✅ Yes  
Status: ✅ Tested

## Overview

The OpenAI Agents SDK adapter provides first-class instrumentation for OpenAI's official agent framework, capturing handoffs, delegations, and multi-agent orchestration patterns.

## Prerequisites

- Node.js 22+
- `@openai/agents-sdk` npm package
- AMC installed (`curl -fsSL https://agentmaturity.co/install.sh | sh`)

## Quick Start

```bash
amc adapters run --agent my-openai-agent --adapter openai-agents-sdk -- node agent.js
```

## Setup

```bash
amc adapters configure \
  --agent my-openai-agent \
  --adapter openai-agents-sdk \
  --route /openai \
  --model gpt-4o
```

## SDK Integration

```typescript
import { instrumentOpenAIAgentsSdk } from "agent-maturity-compass";
import { Agent } from "@openai/agents-sdk";

const instrumented = instrumentOpenAIAgentsSdk({
  agentId: "my-agent",
  gatewayBaseUrl: "http://localhost:3210/openai",
});

const agent = new Agent({
  name: "Assistant",
  model: "gpt-4o",
  instructions: "You are a helpful assistant",
  configuration: {
    baseURL: instrumented.baseUrl,
    apiKey: instrumented.leaseToken,
  },
});

const response = await agent.run("Explain agent maturity");
```

## Evidence Captured

- Agent initialization and configuration
- Handoff events between agents
- Delegation patterns
- Tool/function calls
- Multi-turn conversation state
- Response streaming events

## See Also

- [AutoGen Adapter](autogen.md)
- [LangChain Node.js Adapter](langchain-node.md)
