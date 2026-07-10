# OpenHands Adapter

Adapter ID: `openhands-cli`  
Runtime: Python 3.11+  
Auto-detected: 🧪 Experimental  
Status: 🧪 Experimental

## Overview

OpenHands (formerly OpenDevin) is an open-source autonomous software engineer. The AMC adapter captures code generation, execution, and iterative problem-solving as signed evidence.

## Prerequisites

- Python 3.11+
- OpenHands installed (`pip install openhands`)
- AMC installed (`curl -fsSL https://agentmaturity.co/install.sh | sh`)

## Quick Start

```bash
amc adapters run --agent my-openhands --adapter openhands-cli -- openhands "Fix the bug in main.py"
```

## Setup

```bash
amc adapters configure \
  --agent my-openhands \
  --adapter openhands-cli \
  --route /openai
```

## SDK Integration

```python
# OpenHands uses LiteLLM under the hood
# AMC injects OPENAI_BASE_URL and OPENAI_API_KEY

from openhands.core.main import run_agent

result = run_agent(
    task="Implement a REST API for user management",
    model="gpt-4o"
)
```

## Evidence Captured

- Task planning and decomposition
- Code generation and file edits
- Command execution and outputs
- Iterative debugging cycles
- Test execution results
- Final solution artifacts

## Limitations

- Experimental status: may require manual configuration
- Auto-detection not yet implemented in `amc setup`
- Requires manual install of OpenHands

## See Also

- [OpenClaw Adapter](openclaw.md)
- [Claude Code Adapter](claude-code.md)
