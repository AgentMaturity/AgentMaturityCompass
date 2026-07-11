---
"agent-maturity-compass": minor
---

Add a read-only, outcome-based first-run activation projection shared by `amc connect --status`, Studio, the Console, and OpenAPI. Distinguish signed connection readiness from verified runtime completion, expose bounded evidence references, and fail closed on metadata-only, cross-agent, missing-receipt, malformed, or tampered evidence without creating traffic or a second event store. Keep activation refresh live by excluding API GETs from the Console offline cache and delivering versioned static assets network-first with offline fallback.
