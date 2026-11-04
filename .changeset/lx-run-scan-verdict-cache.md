---
"agent-maturity-compass": patch
---

Sealed run readers keep a small per-file seal verdict while a run file's stat identity, digest and the verification keys are unchanged, so passport, certificate and transformation publications no longer re-read, re-parse and re-verify every run at each currentness check and finish well inside CI time limits.
