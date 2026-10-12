---
"agent-maturity-compass": major
---

A verify command whose verdict is not PASSED no longer prints "Evidence: sufficient" in its claim line. Before, `amc cert verify` on a forged trust certificate, and `amc assurance cert-verify`, `amc passport verify`, `amc audit binder verify` and `amc benchmark verify` on an artifact that failed verification or was only integrity-verified, printed the artifact's claim with `Evidence: sufficient`. Now a FAILED verdict prints `Result: not evaluated (the signature does not verify) · Evidence: untrusted`, an UNTRUSTED verdict (`--allow-unpinned` or `--allow-unanchored`) prints `Evidence: untrusted`, and `--json` carries `statusDimensions.evidence: "untrusted"`; the claim kind stays self-reported at most and never carries a pass. `amc cert inspect` on a trust certificate, which checks no signature, now also reports `Evidence: untrusted`. The API and Studio already labelled these results not evaluated with incomplete evidence; that is unchanged.
