<p align="center">
  <img src="https://img.shields.io/badge/🧭_AMC_SDK-Python-blue?style=for-the-badge" alt="AMC Python SDK" />
</p>

# AMC Python SDK

**Trust scoring for AI agents in 3 lines of Python.**

```python
from amc_sdk import score

result = score("my-agent")
print(f"Level: {result.level}, Score: {result.score}")  # Level: L3, Score: 72.5
```

## Install

```bash
pip install amc-sdk
```

## Quick Start

### Score an agent

```python
from amc_sdk import score, fix

# Get trust score
result = score("my-agent")
print(result.level)          # L3
print(result.score)          # 72.5
print(result.dimensions)     # {strategic_ops: 68, skills: 75, ...}

# Auto-generate fixes
fixes = fix("my-agent", target_level="L4")
print(fixes.guardrails)     # Generated guardrails config
print(fixes.agents_md)      # Generated AGENTS.md
```

### Wrap a LangChain agent

```python
from amc_sdk import with_amc
from langchain.chat_models import ChatOpenAI

# AMC transparently proxies LLM calls and scores behavior
with with_amc("my-langchain-agent"):
    llm = ChatOpenAI()  # automatically routes through AMC gateway
    response = llm.invoke("Hello!")
```

### Decorator for tests

```python
from amc_sdk import amc_guardrails
import pytest

@amc_guardrails(min_level="L3", packs=["prompt-injection", "exfiltration"])
def test_my_agent():
    # Your test code here
    response = my_agent.run("test input")
    assert "expected" in response
    # AMC automatically validates trust level and runs attack packs
```

### Report generation

```python
from amc_sdk import report

# Generate compliance report
r = report("my-agent", framework="eu-ai-act")
r.save_html("compliance_report.html")
r.save_json("compliance_report.json")
```

### Red-team your agent

```python
from amc_sdk import assurance

# Run all attack packs
results = assurance.run("my-agent", scope="full")
print(f"Passed: {results.passed}/{results.total}")

# Run specific packs
results = assurance.run("my-agent", packs=["adversarial-robustness"])
for finding in results.findings:
    print(f"[{finding.severity}] {finding.title}: {finding.details}")
```

## Context Manager

The `with_amc()` context manager starts an AMC gateway, routes your agent's LLM calls through it, and scores behavior:

```python
from amc_sdk import with_amc

with with_amc("my-agent", target_level="L3") as amc:
    # Your agent code here — LLM calls are transparently proxied
    run_my_agent()

    # Check score mid-run
    print(amc.current_score())

# Score is finalized when context exits
print(amc.result.level)  # L3
```

## API Reference

### `score(agent_id, **kwargs) → ScoreResult`

Run AMC scoring on an agent.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `agent_id` | str | required | Agent identifier |
| `target_level` | str | None | Target maturity level (L0-L5) |
| `eu_ai_act` | bool | False | Include EU AI Act classification |
| `json_output` | bool | False | Return raw JSON |

### `fix(agent_id, **kwargs) → FixResult`

Auto-generate remediation for an agent.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `agent_id` | str | required | Agent identifier |
| `target_level` | str | "L3" | Target level for fixes |
| `dry_run` | bool | False | Preview without writing |

### `with_amc(agent_id, **kwargs) → AMCContext`

Context manager that proxies LLM calls through AMC.

### `assurance.run(agent_id, **kwargs) → AssuranceResult`

Run red-team attack packs.

### `report(agent_id, **kwargs) → Report`

Generate compliance reports.

## Requirements

- Python 3.9+
- AMC CLI installed (`npm i -g agent-maturity-compass`)

## License

MIT
