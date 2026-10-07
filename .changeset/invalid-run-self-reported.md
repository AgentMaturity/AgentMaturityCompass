---
"agent-maturity-compass": patch
---

A diagnostic run whose status is not `VALID` now has claim kind `self_reported`, even when its evidence coverage shows observed rows. An `INVALID` or `UNSIGNED` run vouches for nothing it recorded, so before this change it could read "Observed" with untrusted evidence.
