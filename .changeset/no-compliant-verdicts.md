---
"agent-maturity-compass": major
---

AMC no longer prints an EU AI Act compliance verdict or risk class derived from a maturity level.

- `amc quickscore --eu-ai-act` (interactive, `--rapid` and `--auto`) used to print "COMPLIANT (baseline)", "FULLY COMPLIANT" or "NOT COMPLIANT", plus a "High Risk (Art. 6)" class, from the overall level. The `--rapid` level comes from self-answers. The command now prints "EU AI Act: not evaluated" and points to `amc compliance risk-classify` and `amc compliance report --framework EU_AI_ACT`.
- The data residency report's "Compliance Status: COMPLIANT / NON-COMPLIANT" section is now "Residency Policy Checks: No violations found / N violation(s) found". It is labelled as AMC's own configuration checks, not a regulatory compliance determination. The `compliant` field in the JSON report is unchanged.
