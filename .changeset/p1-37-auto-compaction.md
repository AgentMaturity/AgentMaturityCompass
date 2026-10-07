---
"agent-maturity-compass": minor
---

Native sessions can compact automatically at a declared context-window threshold; each compaction is a signed receipt citing the events it replaced.

- `amc agent-loop run`, `amc agent-loop chat` and `amc acp` accept `--context-window <tokens>`, `--compact-threshold <fraction>` (0.5 to 0.95, default 0.8) and `--no-auto-summary`. SDK and ACP callers pass `compaction` in `AgentSessionInit`. Without a declared window, nothing changes; a window is never inferred from a model name.
- After each step, AMC measures the provider-reported prompt size of that step's request. At or above the threshold it first replaces old tool output (4,096 bytes or more, outside the two most recent steps) with a pointer naming its bytes, SHA-256 and source event. Only if that is not enough does it run one tool-free `compaction-summary` step through the normal signed request path and replace the oldest completed turns with the model's summary. At most three boundaries per turn compact. A step without reported usage does not compact.
- Each compaction is a signed `loop/compact` receipt `v: 2` with a `trigger` (measured prompt tokens, declared window, threshold, ratio, formula and the `step/end` it measured) and, for summaries, a `summarizer` naming its signed request and `claimKind: "self_reported"`. Verification recomputes the trigger from the cited usage. Savings stay AMC-measured payload bytes, never tokens. A model-written summary is self-reported, not evidence; the original rows and spill objects remain in the ledger. Version 1 receipts still verify.
- After the next step, an audit row `COMPACTION_EFFECT_OBSERVED` records the prompt tokens before and after, as an observation only.
