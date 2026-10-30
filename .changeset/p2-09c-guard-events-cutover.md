---
"agent-maturity-compass": minor
---

Guard-events cutover per workspace, gated on parity (P2-09c). `amc evidence-stores cutover` records `.amc/guard-events-stage.json` only when `amc evidence-stores parity` would report the legacy guard-event store and `evidence.sqlite` identical; the workspace then reads and writes guard events in `evidence.sqlite`. The legacy file is never touched, so reverting is deleting the record or setting `AMC_GUARD_EVENTS_STAGE=DUAL_WRITE`, which still overrides in both directions. Under DUAL_WRITE, retention with `pruneGuardEventsAfterDays` now prunes the evidence-store copy too, through the hold-aware deletion gate, so the two stores stay in parity.

freeze-exception: P2-09 — `amc evidence-stores cutover` is the parity-gated guard-events cutover the P2-09 spec asks for.
