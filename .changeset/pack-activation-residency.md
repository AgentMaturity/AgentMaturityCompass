---
"agent-maturity-compass": patch
---

Industry Packs online activation, which this change gated on residency before its POST, is gone in this release: `amc domain pack activate` verifies a licence locally and sends no request (`industry-packs-paywall-truthful`), and Industry Packs are free (`industry-packs-free`), so no licence is needed for access.

This was partial, unqualified P2-01 source, and no activation request remains for it to gate.
