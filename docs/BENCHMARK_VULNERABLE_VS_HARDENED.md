# Benchmark: Weak Agent vs Hardened Agent

**Claim under test:** AMC's score reflects what an agent *does*, so a deliberately weak agent and a hardened one starting from the same baseline should diverge — and the divergence should be reproducible by anyone.

> **Superseded in 2.0.0 (P0-18).** The level table this page used to show came from evidence the dogfood seeder wrote: OBSERVED gateway events, generated to satisfy each gate. Seeded events are now labelled `synthetic_example` and count for nothing, so they never raise a level, and the harness no longer reproduces those levels. The recorded run has been removed. A benchmark of levels returns once the gates are rebuilt on evidence AMC's runtime emits (P1-07).

`npm run qa:dogfood-8-agents` still exists, but it is a QA harness, not a benchmark: it needs `AMC_DEV_DOGFOOD=1` in a source checkout, exercises the Score, Shield, Enforce, Vault, Watch, Comply, Fleet and Passport surfaces with synthetic evidence, and reports its strict-maturity targets as unmet until P1-07. See [EVIDENCE_TRUST.md](EVIDENCE_TRUST.md).

## Honesty boundary

These agents are AMC's own QA fixtures and their evidence is synthetic. They are **not** evidence about any third-party agent, and they are not a leaderboard of real products. Score your own agent with `amc` to get a result that means something for your system.
