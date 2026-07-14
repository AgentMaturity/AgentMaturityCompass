# AMC Methodology Crosswalk

**Audience:** auditors, compliance teams, and buyers who need to place AMC's L0–L5 maturity levels and eight surfaces alongside the frameworks they already use.

**Boundary, stated up front:** AMC maturity levels and the mappings below are evidence-organization aids, not legal certification. AMC produces signed, verifiable evidence that *supports* assessments against these frameworks; it does not by itself make an agent "compliant," and only `READY` evidence readiness is claim-eligible. Framework text always controls.

## How to read this

- **Levels (L0–L5)** describe how much verified operational evidence exists for an agent, with hard evidence gates per level (event counts, session counts, observation windows, trust tiers — see [Scoring methodology](SCORING_METHODOLOGY.md)).
- **Surfaces** are where evidence comes from: Score, Shield, Enforce, Vault, Watch, Comply, Fleet, Passport.
- Each row below says which AMC outputs an assessor can pull as evidence for that framework area — every one of them exportable as signed artifacts (`amc bundle export`, `amc audit binder create`, `amc comply report`).

## Levels ↔ what an assessor can rely on

| AMC level | Evidence character | Reasonable assessor use |
|---|---|---|
| L0 Absent | No accepted evidence | Establishes an honest baseline; nothing to rely on yet |
| L1 Initial | Sparse captured output | Existence of the agent and first observed behavior |
| L2 Developing | Documented + reviewed evidence | Documented-process claims with review trails |
| L3 Defined | Repeatable, measured evidence incl. audits + metrics | Repeatable-process claims; quantitative monitoring exists |
| L4 Managed | Continuously monitored, artifact-backed, OBSERVED evidence | Operating-effectiveness claims over a period |
| L5 Optimizing | OBSERVED-only, Merkle-anchored, self-correcting | Strongest continuous-control claims AMC can support |

## Frameworks

### EU AI Act
AMC ships an EU AI Act compliance pack (risk-level classifier: unacceptable/high/limited/minimal; article-mapped question sets) and generates audit binders with signed evidence per article area — risk management (Art. 9), data governance (Art. 10), technical documentation (Art. 11), record-keeping (Art. 12), transparency (Art. 13), human oversight (Art. 14), accuracy/robustness/cybersecurity (Art. 15). Surfaces: Comply (mappings, reports), Watch (record-keeping evidence), Enforce (human-oversight and control evidence), Shield (robustness testing evidence).

### NIST AI RMF
Map AMC surfaces to the four functions: **Govern** → Governor policies, approval workflows, signed policy versioning; **Map** → Score diagnostics and agent context records; **Measure** → Score/Watch metrics, drift detection, assurance-pack results; **Manage** → Enforce guardrails, incident workflows, corrective-action receipts. The `nist_ai_rmf` compliance pack carries the question-level mapping.

### ISO/IEC 42001 (AIMS)
AMC evidence supports AIMS clauses on operational planning and control, performance evaluation, and improvement: continuous monitoring receipts (Watch), internal-audit-style binders (Comply/Audit), nonconformity and corrective action trails (Incidents/Corrections), and management-review inputs (leaderboards, KPI correlation). The `iso_42001` pack carries the mapping.

### SOC 2 (Trust Services Criteria)
AMC artifacts slot into CC-series evidence requests: change management (signed policy/config versions), logical access (Vault, leases, RBAC evidence), monitoring (Watch alerts, anomaly receipts), incident response (incident lifecycle records). AMC evidence complements — does not replace — the service organization's own control environment.

### OWASP LLM Top 10
Shield assurance packs exercise prompt injection, insecure output handling, data leakage/exfiltration, tool misuse, and jailbreak classes, producing pass/fail receipts per scenario. Enforce policies demonstrate mitigations at runtime.

### MITRE ATLAS
Watch's SIEM exporter maps observed events to ATT&CK/ATLAS technique tags; Shield's adversarial packs provide technique-aligned test evidence.

### GDPR
Vault (DLP patterns, data-residency policies, key custody) and Comply's `gdpr` pack organize evidence relevant to data-protection assessments of agent systems that touch personal data.

### AIUC-1 (agent certification)
AMC is not an AIUC auditor. Its signed evidence bundles, red-team receipts, and continuous monitoring records are the kind of artifacts an AIUC-1 style audit consumes — collected continuously instead of assembled at audit time.

## Pulling the evidence

```bash
amc compliance report --framework EU_AI_ACT   # framework-mapped report
amc audit binder create                     # assessor-ready signed binder
amc bundle export --run <runId> --out evidence.amcbundle
amc bundle verify evidence.amcbundle        # anyone can check integrity offline
```

*Mappings summarized here are maintained in the compliance packs (`compliance-*.json`) and covered by the drift-checked docs suite. If this document and a pack disagree, the pack is canonical.*
