---
"agent-maturity-compass": minor
---

Add the infrastructure of the adversarial unauthorized-effects suite (P1-48):
32 attack tasks across eight classes, a deterministic generator of 25 distinct
seeded variants per task, an external observer that imports nothing from AMC and
watches real filesystem, network, model-gateway and git effects with a positive
control on every trial, an oracle, a summarizer (Wilson 95% intervals and the
zero-event upper bound), a results schema, an uncontained validity control and a
pluggable Pi adapter whose cells record "not run" without a qualified Pi
install. The suite infrastructure ships; the AMC adapter and results are
pending. No AMC attack success rate is claimed. New:
`examples/adversarial-suite/`, `docs/ADVERSARIAL_SUITE.md`.
