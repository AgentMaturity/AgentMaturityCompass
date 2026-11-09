---
"agent-maturity-compass": patch
---

A session root descriptor (`amc session anchor`, `amc session export`) now takes its time window from the signed `session/open` and `session/close` rows instead of the session record's start and end columns, which are not signed, so a workspace writer can no longer move an anchored or exported session's window (fix3 S21). Anchors made before keep verifying through their stored descriptor; re-anchoring such a session appends one new entry under the new digest.
