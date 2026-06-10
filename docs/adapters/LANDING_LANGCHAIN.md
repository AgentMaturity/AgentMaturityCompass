# AMC for LangChain Users

You already use LangChain. AMC wraps it — zero code changes.

## Why this matters
LangChain gives you agent orchestration. AMC gives you trust evidence for what that agent actually does.

## Get started

```bash
# Wrap your existing LangChain agent
amc wrap langchain -- python my_agent.py

# Score it
amc

# See what gaps exist
amc fix
```

## What you get
- Execution evidence from real LangChain runs
- Trust scoring across 5 dimensions
- Adversarial assurance against prompt injection, exfiltration, and more
- CI gates that prevent trust regressions

## Adapter docs
- `docs/adapters/langchain-python.md`
- `docs/adapters/langchain-node.md`
- `docs/adapters/langgraph-python.md`

## Next steps
- `docs/START_HERE.md`
- `docs/AFTER_FIRST_SCORE.md`
- `docs/CI_TEMPLATES.md`
