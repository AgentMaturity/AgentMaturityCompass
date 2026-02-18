# Go-To-Market Pack (Product / UX / Commercialization)

This pack translates AMC's implemented capabilities into partner-facing narratives, demo flows, and evidence UX language.

## 1) CLI UX Story (Operator-Facing)

**Positioning:** AMC is designed for command-line-first operators who need deterministic, signed outputs.

- Discoverability: improved help and unknown-command guidance (`amc --help`, typo handling)
- Fast confidence loop: `amc run`, `amc report`, `amc verify` with explicit status semantics
- Decision support: benchmark and experiment subcommands emphasize reproducible comparisons over vanity metrics

## 2) Architecture Map (Buyer / Security Review)

Use these layers in architecture diagrams:

1. **Ingress Layer** — adapters, bridge, SDK instrumentation
2. **Evidence Layer** — receipts, ledger, signatures, verification
3. **Policy Layer** — governor, packs, gate checks, trust tiers
4. **Decision Layer** — scoring, temporal decay, coherence/drift analytics
5. **Ops Layer** — runbooks, migration safety, incident readiness

**Message:** AMC is not a dashboard bolt-on; it is an evidence-and-policy pipeline with deterministic verification.

## 3) Launch Narrative (Exec + PM)

- **Problem:** teams can claim maturity without durable evidence
- **Approach:** collect signed artifacts, score with explicit policy gates, cap claims when evidence is weak
- **Outcome:** trustworthy release decisions and comparable benchmark narratives

Launch assets to pair with this pack:

- `docs/LAUNCH.md`
- `docs/BENCHMARKS.md`
- `docs/ATTESTATION_EVIDENCE_PATHS.md`
- `docs/RELEASE_RUNBOOK.md`

## 4) Benchmark Narrative (Field / Sales Engineering)

When presenting benchmark outcomes:

- Lead with test conditions and evidence coverage
- Report confidence limits and trust tier, not just a scalar score
- Surface regressions with signed diff artifacts
- Treat "UNKNOWN" as policy-enforced honesty, not a failure

## 5) Evidence Packaging UX (Audit / Partner Handoff)

For partner handoffs, include:

- Signed bundle manifest
- Verification instructions (offline-capable)
- Evidence provenance summary (self-reported vs observed vs attested)
- Policy exceptions / waivers trail

Recommended UX principles:

- **Progressive disclosure:** high-level verdict first, forensic details one click deeper
- **Tamper visibility:** any invalid signature should be unmistakably prominent
- **Deterministic replay:** same inputs should regenerate byte-identical artifacts

## 6) Partner-Ready Demo Flow (30 minutes)

1. **Setup (5m):** show workspace + trust settings
2. **Run (8m):** execute diagnostic and benchmark flow
3. **Challenge (7m):** introduce tamper or missing evidence and show enforced cap
4. **Recover (5m):** remediate and re-run
5. **Handoff (5m):** export signed bundle and verify on a separate machine

## 7) Competitive Framing

Use capability-backed comparisons:

- Competitors may provide dashboards; AMC provides **signed, verifiable decision artifacts**
- Competitors may score everything; AMC can intentionally return **UNKNOWN** under insufficient evidence
- Competitors may rely on docs/process claims; AMC ties claims to **implemented controls + tests**

## 8) Commercial Readiness Checklist

- [ ] Demo script rehearsed with failure injection
- [ ] Benchmark registry seeded with 2+ comparable scenarios
- [ ] Partner handoff packet template finalized
- [ ] Security review map aligns with architecture layer model
- [ ] Release gate policy approved by operator and governance owners

---

Owner suggestion: Product + Security Engineering joint review each release cycle.
