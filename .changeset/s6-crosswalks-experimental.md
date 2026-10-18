---
"agent-maturity-compass": major
---

Compliance crosswalks: eight sourced framework families, 290 clause-level controls and crosswalk links with a relation and a rationale, all labelled experimental (P1-45, landing S6 and the round-2 framework controls after an AI refutation pass).

- `amc comply report --framework` accepts eight more families: `DORA`, `NIS2`, `HHS_HTI_1`, `NIST_AI_600_1`, `CO_AI_ACT`, `TX_TRAIGA`, `CA_AI_LAWS` and `KR_AI_BASIC_ACT`, with 48 built-in mappings that cite the official text and the date it was read. `amc compliance init` seeds them into new maps; existing signed maps are unchanged. Versioned or clause-qualified names (`GDPR Art. 9`, `PCI DSS v4.0.1`, `SOC 2 Type II`, `EU NIS2 2022/2555`) now resolve to their family. `ONC_HTI_1` is an input alias for `HHS_HTI_1`, not a framework id.
- Every family, mapping and crosswalk link is experimental: drafted and refuted by AI agents, with no named-expert sign-off (D-08 pending). The Markdown report prints that above its results, plus the family's flags: HHS HTI-1 is at risk because an HTI-5 final rule may delete its model-card requirements, and the Colorado SB26-189 text (retrieved 2026-10-04) must be re-verified before publishing.
- A crosswalk link has `relation` (`equivalent`, `partial` or `conflicting`) and a non-empty `rationale`; `equivalent` needs an expert sign-off id, so every built-in link is `partial`. The `coverage` label is removed. A result for one framework never sets a result for another.
- ISO/IEC 42005 is descoped: the name resolves to no family (zero mapped controls, `unverified: source unreachable`), and the `ISO_42001` display name says its ISO 42005 and 42006 categories are unverified.
- Coverage scores: UNKNOWN keeps earning 0, as since P0-17, and a category without a control id now makes `coverageScore` throw instead of being scored. Scores of reports with UNKNOWN rows that were computed before 2.0 drop when recomputed; warn `amc comply report` users who compare them.
- The review corrected built-in maps that new workspaces receive. Seven S6 mappings and three HIPAA mappings had a "no denied audit" check naming only audit types AMC never emits, so it could not fail; it now names emitted types (`TRACE_RECEIPT_INVALID`, `TRACE_EVENT_HASH_NOT_FOUND`, `SECRET_EXFILTRATION_SUCCEEDED`) or is removed where no emitted type fits (`nist600_data_privacy`, `hipaa_physical_safeguards`). `hti1_dsi_feedback` now says §170.315(b)(11)(ii)(C) asks for feedback on evidence-based DSIs, not on a Predictive DSI.

freeze-exception: P1-45 — S6 crosswalk families and round-2 clause-level controls, landed experimental after review
