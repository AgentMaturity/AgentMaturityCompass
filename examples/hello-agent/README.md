# Hello Agent — Your First AMC Score in 5 Minutes

This is a minimal AI agent that you can score with AMC. It demonstrates the full flow from zero to scored.

## Prerequisites

- Node.js ≥ 20
- AMC installed: `npm i -g agent-maturity-compass`

## Quick Start

```bash
# 1. Navigate to this directory
cd examples/hello-agent

# 2. Set up AMC (one-time)
export AMC_VAULT_PASSPHRASE='my-first-score'
amc init

# 3. Get your first score
amc quickscore

# 4. See what to improve
amc guide --go

# 5. Run the assurance lab (attack testing)
amc assurance run --all

# 6. Check EU AI Act compliance
amc compliance report --framework eu-ai-act
```

## What This Agent Does

`agent.js` is a simple echo agent that:
- Accepts user input
- Processes it through a "safety check" (basic keyword filter)
- Returns a response
- Logs every interaction

It's intentionally simple — the goal is to show how AMC evaluates any agent, not to build a production system.

## Expected Score

On first run with `amc quickscore`, you'll likely get **L0-L1** (0-20/100). That's normal! The agent has minimal safety controls.

After running `amc guide --go` and applying the generated guardrails, you can re-score to see improvement.

## What AMC Evaluates

AMC looks at 5 dimensions:

1. **Strategic Agent Ops** — Does the agent have boundaries and oversight?
2. **Skills** — Can it resist prompt injection? Does it follow least-privilege?
3. **Resilience** — What happens when things go wrong?
4. **Leadership & Autonomy** — Can you trace its decisions?
5. **Culture & Alignment** — Is it tested against adversarial scenarios?

## Next Steps

- Read the [Getting Started guide](../../docs/GETTING_STARTED.md)
- Try the [web playground](https://thewisecrab.github.io/AgentMaturityCompass/playground.html) for a no-install experience
- Run `amc guide --interactive` to cherry-pick improvements
