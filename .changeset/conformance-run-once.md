---
"agent-maturity-compass": patch
---

Contributor tooling only, no runtime change: the session-store conformance tests run each backend's suite once and share the report, instead of running both suites a second time to compare their case lists, so the file no longer times out when several test suites share a machine.
