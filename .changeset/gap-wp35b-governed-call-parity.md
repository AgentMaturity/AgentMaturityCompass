---
"agent-maturity-compass": patch
---

ToolHub and provider hook control now apply the same deny-only checks as the native tool pipeline (AXR-01): the active compiled plan, the prompt-injection matcher, the runtime firewall, residency egress, the signed tool allowlist and (on hook control) the signed Action Policy. A call one plane denies is denied on the others. ToolHub records such a refusal as `TOOLHUB_GOVERNED_CALL_DENIED`; hook control answers `deny` with `ACTION_POLICY_DENIED` and names the check. As on the native plane, a workspace with no signed runtime firewall policy now has ToolHub and hook-controlled calls refused until one is created (`amc firewall enable`).
