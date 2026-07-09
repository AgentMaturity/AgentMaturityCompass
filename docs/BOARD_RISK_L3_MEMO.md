# What L3 Means For Business Risk

This memo is for boards and executives reviewing an AMC maturity result. It explains what an L3 result means in business terms and what it does not mean.

## Executive Interpretation

L3 means the score describes repeatable, measurable, auditable controls. A board should only rely on that interpretation when the artifact is `VALID`, verification passed, and evidence readiness is `READY`, because those conditions show that the result is intact and backed by sufficient accepted evidence.

L3 is not a blanket approval or a legal threshold. It does not mean the agent is safe for every workflow, user group, geography, data class, or autonomy level. An evidence-ready L3 result can inform a controlled-use decision when residual risk is accepted by accountable owners and monitoring stays active.

## What The Board Can Approve At L3

With a `VALID`, verified, evidence-ready L3 report, boards can consider:

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
| Can we assess high-risk governance expectations? | L3 is a maturity signal, not legal compliance or certification. | Applicable-obligation mapping, legal review, signed evidence refs, audit binder |

## Residual Risk Rules

Use evidence-ready L3 as one input to a controlled-use decision:

1. Define the approved use case in business language.
2. Map the use case to data sensitivity, user impact, legal obligations, and operational blast radius.
3. Compare residual expected annual loss against risk appetite.
4. Require owners for every material gap below L3.
5. Re-run AMC after remediation, major model/provider changes, policy changes, or incidents.

If residual risk is above appetite, the right board decision is not "approve because it reached L3." The right decision is to limit scope, require controls, or hold expansion until the risk owner accepts or reduces the exposure.

## Source Alignment

- NIST AI Risk Management Framework: NIST describes AI risk management as improving the ability to incorporate trustworthiness considerations into AI design, development, use, and evaluation.
- EU AI Act: obligations depend on the system, role, use case, and classification. The European Commission's current timeline applies Annex III high-risk rules from 2 December 2027 and product-integrated high-risk rules from 2 August 2028 following the AI Omnibus political agreement. See the [official high-risk guidance](https://digital-strategy.ec.europa.eu/en/policies/guidelines-ai-high-risk-systems).
- AMC: L3 maps to repeatable and auditable controls. L4 and L5 target stronger operating assurance and continuous verification; AMC does not certify legal compliance.

## Board Decision Template

Use this language when an agent reaches L3:

> The board approves limited production use for the stated scope only, based on a VALID and verified AMC artifact with evidence readiness READY. Expansion requires current evidence, residual risk inside appetite or explicit risk-owner acceptance, named remediation owners for remaining gaps, and monitoring that alerts the accountable owner before drift becomes operational harm. This decision is not a legal compliance certification.

## What To Ask Next

- Which business process is approved, and which processes are explicitly out of scope?
- Which risk owner accepts residual risk if expected annual loss is above appetite?
- Which gaps are below L3, who owns them, and what date will they be re-tested?
- What monitoring would cause the agent to be paused or rolled back?
- What evidence can be shown to auditors without exposing secrets or customer data?
