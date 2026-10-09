---
"agent-maturity-compass": patch
---

Capture internal observability records' workspace context and check each grouped export attempt before sending, with manual redirects and bounded retries. Report actual successful item counts, count final target losses once, and preserve buffered records if request preparation fails. Keep local telemetry-drop audit rows while omitting their recursive export.

This is partial, unqualified P2-01 source. Public DTOs and wire formats remain unchanged; missing caller scope, SDK-owned egress, prior POST effects and delivery/residency qualification remain separate.
