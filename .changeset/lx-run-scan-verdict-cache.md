---
"agent-maturity-compass": patch
---

Sealed run readers reuse a run file's seal verdict while its exact bytes and the verification keys are unchanged, so passport, certificate and transformation publications no longer re-parse and re-verify every run at each currentness check and finish well inside CI time limits.
