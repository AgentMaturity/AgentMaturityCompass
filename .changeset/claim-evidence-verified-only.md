---
"agent-maturity-compass": patch
---

A claim line says `Evidence: sufficient` only when the evidence is verified: the claim kind is observed (or independently reviewed). Before, any result with at least one record printed `Evidence: sufficient`, even when nothing behind it was verified: `amc audit binder create` on an empty workspace, `amc badge`, `amc passport` results, attestations, imports, the control-surface scorers and results stored by AMC 1.x. These now print `Claim: Self-reported · … · Evidence: incomplete`, and `--json`, MCP, the API and Studio carry `statusDimensions.evidence: "incomplete"`. Compliance categories and control results whose admitted records are not all observed also read `incomplete`. No result changes: a self-reported regulated result can still show `pass` when records were provided, and a failed or unpinned verification still reads `untrusted`.
