# AutoGen Adapter

Adapter ID: `autogen-cli`  
Runtime: Python 3.11+  
Auto-detected: ✅ Yes  
Status: ✅ Tested

## Overview

AutoGen is Microsoft's framework for building multi-agent conversational systems. The AMC adapter captures agent conversations, code execution, and multi-turn interactions.

## Prerequisites

- Python 3.11+
- `pyautogen` package installed
- AMC installed (`curl -fsSL https://agentmaturity.co/install.sh | sh`)

## Quick Start

```bash
amc adapters run --agent my-autogen --adapter autogen-cli -- python autogen_agent.py
```

## Setup

```bash
amc adapters configure \
  --agent my-autogen \
  --adapter autogen-cli \
  --route /openai
```

## SDK Integration

```python
import autogen

# AMC injects the gateway URL and lease token
config_list = [{
    "model": "gpt-4o",
    "api_key": "dummy",  # AMC provides this
    "base_url": "http://localhost:3210/openai"  # AMC gateway
}]

assistant = autogen.AssistantAgent(
    name="assistant",
    llm_config={"config_list": config_list}
)

user_proxy = autogen.UserProxyAgent(
    name="user_proxy",
    code_execution_config={"work_dir": "coding"}
)

user_proxy.initiate_chat(assistant, message="Analyze this codebase")
```

## Evidence Captured

- Multi-agent conversations
- Code generation and execution
- Tool/function calls
- Human-in-the-loop interactions
- Conversation termination conditions

## See Also

- [CrewAI Adapter](crewai.md)
- [OpenAI Agents SDK Adapter](openai-agents-sdk.md)
