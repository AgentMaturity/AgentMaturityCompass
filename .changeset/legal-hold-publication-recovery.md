---
"agent-maturity-compass": patch
---

Prepare and verify legal-hold record and HEAD signatures before journal commitment or registry publication. Locked owner initialization can recover pending journal publication and republish a stale HEAD only from a trusted anchor matching verified disk rows, without advancing the journal. Initialization also reports unresolved legacy IDs and raw digests.

This is partial, unqualified P2-01 source. Record-pair I/O interruption after journal commitment, portable checkpoint trust and shared-journal signer rotation remain open. No tests, evaluations, CI or release qualification ran for this change.
