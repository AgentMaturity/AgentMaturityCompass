# What L3 Means For Business Risk

This memo is for boards and executives reviewing an AMC maturity result. It explains what an L3 result means in business terms and what it does not mean.

## Executive Interpretation

L3 means the agent has repeatable, measurable, auditable controls. It is the first level where a board can usually discuss limited production use, because the team can show what was tested, what evidence was captured, what failed, and what will be remediated.

L3 is not a blanket approval. It does not mean the agent is safe for every workflow, user group, geography, data class, or autonomy level. It means the agent is ready for controlled use when residual risk is accepted by accountable owners and when monitoring stays active.

## What The Board Can Approve At L3

At L3, boards can consider:

- Limited production use with named business and technical owners.
- Clearly bounded autonomy: which actions the agent can take, where human approval is required, and which data it may access.
- A dated remediation plan for L2 or lower gaps.
- Drift monitoring and incident escalation before the agent's scope expands.
- A requirement that evidence coverage remains current for the approved use case.

Boards should avoid approving:

- Broad autonomy expansion without a fresh run.
- High-impact data or regulated workflows when evidence coverage is weak.
- Vendor or team claims that are not tied to observed evidence.
- External claims that imply L4/L5 assurance, continuous verification, or certification.

## Business Risk Translation

| Board question | L3 answer | Required evidence |
|---|---|---|
| Can we explain what the agent is allowed to do? | Yes, with defined scope and controls. | Agent inventory, policy boundaries, approval gates |
| Can we prove the score was not self-reported? | Partially to strongly, depending on evidence mix. | Evidence coverage, integrity index, trust-tier breakdown |
| Can we quantify residual risk? | Directionally, using incident frequency, impact, and maturity multipliers. | Business risk report, heatmap, appetite status |
| Can we detect drift? | Yes, if monitoring is configured and owned. | Watch or monitor run status, thresholds, alert owners |
| Can we satisfy high-risk governance expectations? | L3 is a minimum governance baseline, not the end state. | EU AI Act mapping, NIST AI RMF mapping, audit binder |

## Residual Risk Rules

Use L3 as a controlled-use threshold:

1. Define the approved use case in business language.
2. Map the use case to data sensitivity, user impact, legal obligations, and operational blast radius.
3. Compare residual expected annual loss against risk appetite.
4. Require owners for every material gap below L3.
5. Re-run AMC after remediation, major model/provider changes, policy changes, or incidents.

If residual risk is above appetite, the right board decision is not "approve because it reached L3." The right decision is to limit scope, require controls, or hold expansion until the risk owner accepts or reduces the exposure.

## Source Alignment

- NIST AI Risk Management Framework: NIST describes AI risk management as improving the ability to incorporate trustworthiness considerations into AI design, development, use, and evaluation.
- EU AI Act: high-risk AI systems require governance, risk management, transparency, human oversight, accuracy, robustness, cybersecurity, and post-market monitoring obligations depending on use case.
- AMC: L3 maps to repeatable and auditable controls. L4 and L5 are still needed for proactive risk management, stronger evidence, continuous verification, and certifiable operating posture.

## Board Decision Template

Use this language when an agent reaches L3:

> The board approves limited production use for the stated scope only. Expansion requires current AMC evidence, residual risk inside appetite or explicit risk-owner acceptance, named remediation owners for remaining gaps, and monitoring that alerts the accountable owner before drift becomes operational harm.

## What To Ask Next

- Which business process is approved, and which processes are explicitly out of scope?
- Which risk owner accepts residual risk if expected annual loss is above appetite?
- Which gaps are below L3, who owns them, and what date will they be re-tested?
- What monitoring would cause the agent to be paused or rolled back?
- What evidence can be shown to auditors without exposing secrets or customer data?
