# CrewAI Adapter

Adapter ID: `crewai-cli`  
Runtime: Python 3.11+  
Auto-detected: ✅ Yes  
Status: ✅ Tested

## Overview

CrewAI is a framework for orchestrating role-playing autonomous AI agents. The AMC adapter captures crew execution, agent interactions, task delegation, and tool usage.

## Prerequisites

- Python 3.11+
- `crewai` package installed
- AMC installed (`curl -fsSL https://agentmaturity.co/install.sh | sh`)

## Quick Start

```bash
amc adapters run --agent my-crew --adapter crewai-cli -- python crew.py
```

## Setup

```bash
amc adapters configure \
  --agent my-crew \
  --adapter crewai-cli \
  --route /openai
```

## SDK Integration

```python
from crewai import Agent, Task, Crew
from langchain_openai import ChatOpenAI

# AMC routes all LLM calls through the gateway
llm = ChatOpenAI(model="gpt-4o")

researcher = Agent(
    role="Researcher",
    goal="Find relevant information",
    llm=llm
)

task = Task(
    description="Research agent maturity frameworks",
    agent=researcher
)

crew = Crew(agents=[researcher], tasks=[task])
result = crew.kickoff()
```

## Evidence Captured

- Crew initialization and configuration
- Agent role assignments and goals
- Task delegation and execution
- Inter-agent communication
- Tool calls and results
- Final crew output

## See Also

- [AutoGen Adapter](autogen.md)
- [LangChain Python Adapter](langchain-python.md)
