# Industry Pack Audit

The **Industry Pack Audit** is the paid Industry Packs deliverable: it turns a
sector diagnostic from *a score* into *an audit artifact you can hand to a
regulator, customer, or your own risk team*.

For every control in an Industry Pack the audit produces:

- **A level score and a PASS / ADEQUATE / GAP verdict** against the pack's own
  L1/L3/L5 anchors.
- **A multi-framework crosswalk** — each control is mapped to public control
  anchors in **EU AI Act**, **NIST AI RMF**, **ISO/IEC 42001**, and **SOC 2**,
  plus the sector regulation itself. One assessment lines up with several
  audits at once.
- **The evidence an auditor expects** for that control.
- **A concrete remediation for anything short of PASS** — a generated policy
  stub, guardrail, or evidence-collection recipe, with the pack's L3 descriptor
  as the acceptance criterion the agent must meet.

The whole bundle is **canonicalized and hashed into a tamper-evident receipt**
(`sha256`). Anyone can recompute the hash over the signed bundle and detect a
single-byte change — the same signed-evidence guarantee the rest of AMC uses,
now applied to industry compliance.

## Usage

The audit is part of the paid Industry Packs tier and is entitlement-gated.

```bash
# Full audit for a pack (JSON), written to a signed bundle file
amc domain apply --agent my-agent --pack clinical-trials --audit \
  --audit-bundle clinical-trials.audit.json --json

# Auditor-ready Markdown
amc domain apply --agent my-agent --pack digital-health-record --audit

# Narrow the crosswalk to a single framework
amc domain apply --agent my-agent --pack digital-payments --audit --framework eu_ai_act

# Score against real responses instead of the L1 baseline
amc domain apply --agent my-agent --pack clinical-trials --audit \
  --responses responses.json
```

`--responses` is a JSON object of `{ "<questionId>": <level 1-5> }`. Without it
the audit runs a **baseline at L1**, which is useful on its own: it produces the
complete "here is everything you would need to prove, and the fix for each gap"
roadmap for that sector.

`--framework` accepts `eu_ai_act`, `nist`, `iso42001`, `soc2`, or `sector`.

## Verifying a bundle

The bundle carries a `receiptHash` over its canonical form. To verify, recompute
`sha256(canonicalize(bundle-without-receiptHash))` and compare — if a single
byte of the score, evidence, crosswalk, or remediation was edited after signing,
the hashes will not match.

## What it proves — and what it doesn't

- **It proves integrity.** The bundle you verify is exactly what was generated;
  nobody edited a control, verdict, or citation afterward.
- **It does not prove your agent is compliant by itself.** A signed bundle of
  L1 controls is an honest picture of an agent with no evidence yet. The value
  is the auditable structure — controls, crosswalk, evidence, and fixes — that
  you close over time as real evidence accrues.

## Notes

- The crosswalk uses **public standard identifiers** (EU AI Act articles, NIST
  AI RMF subcategories, ISO/IEC 42001 Annex A controls, SOC 2 Trust Services
  Criteria) as indicative anchors. It is a mapping aid, not a substitute for a
  qualified assessor's judgment.
- The audit builder is pure and deterministic: the same inputs always yield the
  same receipt, so bundles are reproducible and diffable.
