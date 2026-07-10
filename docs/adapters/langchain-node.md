# LangChain (Node.js) Adapter

Adapter ID: `langchain-node`  
Runtime: Node.js 22+  
Auto-detected: ✅ Yes  
Status: ✅ Tested

## Overview

The LangChain Node.js adapter captures evidence from LangChain.js agents. It uses the `createLangChainJsBridge` for deep instrumentation of tool calls, chain steps, and LLM interactions, all routed through the AMC gateway for signed evidence capture.

## Prerequisites

- Node.js 22+
- `langchain` and `@langchain/core` npm packages
- AMC installed (`curl -fsSL https://agentmaturity.co/install.sh | sh`)

## Quick Start

```bash
amc adapters run --agent my-agent --adapter langchain-node -- node my_agent.js
```

## Setup

### 1. Auto-detect

```bash
amc adapters detect
# Output: langchain-node -> node 22.x.x ✓
```

### 2. Configure

```bash
amc adapters configure \
  --agent my-agent \
  --adapter langchain-node \
  --route /openai \
  --model gpt-4o
```

## SDK Integration (LangChain JS Bridge)

For first-class instrumentation, use the AMC JS bridge:

```typescript
import { createLangChainJsBridge } from "agent-maturity-compass";
import { ChatOpenAI } from "@langchain/openai";

const bridge = createLangChainJsBridge({
  agentId: "my-agent",
  gatewayBaseUrl: "http://localhost:3210/openai",
});

const llm = new ChatOpenAI({
  model: "gpt-4o",
  configuration: { baseURL: bridge.baseUrl, apiKey: bridge.leaseToken },
});

const response = await llm.invoke("Explain agent maturity levels.");
```

## Environment Variables Injected

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | Lease token (routed through gateway) |
| `OPENAI_BASE_URL` | AMC gateway URL |
| `AMC_AGENT_ID` | Agent identifier |
| `AMC_LEASE_TOKEN` | Short-lived run lease |

## Evidence Captured

- LLM calls (model, tokens, latency)
- Tool/function calls with arguments and results
- Chain step execution traces
- Process lifecycle events
- Error traces and exit codes

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `ERR_MODULE_NOT_FOUND` | Ensure `@langchain/openai` is installed: `npm i @langchain/openai` |
| Base URL mismatch | Check `amc up` is running; the bridge auto-resolves the gateway URL |
| TypeScript errors | Use `@langchain/core` ≥ 0.3 for full type compatibility |

## See Also

- [LangChain Python Adapter](langchain-python.md)
- [LangGraph Adapter](langgraph-python.md)
- [Adapter Architecture](../ADAPTERS.md)
