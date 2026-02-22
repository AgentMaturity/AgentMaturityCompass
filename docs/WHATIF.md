# WHATIF

The What-If simulator previews equalizer and policy impact before signing target changes.

It is deterministic (no model calls).

## Core Principle

`EffectiveLevel(question) = min(currentMeasuredLevel, targetLevel)`

What-if previews show how target changes alter effective levels, autonomy, and gates.

## CLI

```bash
# file-driven simulation
amc whatif targets --agent <agentId> --in ./targets.json --out ./whatif.json

# quick equalizer tuning from CLI
amc whatif equalizer --agent <agentId> --set AMC-1.1=3 --set AMC-3.3.1=5
```

## What Is Predicted

- top level deltas across 67 questions
- effective levels after applying target values
- governor execute/simulate permission matrix
- projected `AutonomyAllowanceIndex`
- budget pressure snapshot from recent usage
- CI gate pass/fail prediction (if signed gate policy exists)

## Car-Engine Tuning Mindset

- raise levels only where evidence gates are realistically attainable
- validate that safety/governance foundations stay ahead of autonomy unlocks
- use what-if, then apply signed targets through owner workflow

## Apply Path

- Console `Equalizer -> Apply`, or
- target CLI workflow (`amc target set` / signed target updates)

Every applied target update is audited as observed evidence.
