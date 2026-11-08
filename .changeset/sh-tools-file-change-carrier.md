---
"agent-maturity-compass": patch
---

File-change evidence is carried on the tool outcome (SH-TOOLS-06c): `fs.write`, `fs.edit` and `apply_patch` declare `fileChanges` on their result, the pipeline copies it to the outcome, and `toolEvidenceFor` writes `fileChanges` (every file written or deleted; `afterSha256` is null for a deletion) and `fileChange` (the first entry) into both the audit payload and the audit meta, where the resume rules read it. The earlier token-keyed side channel (`noteFileChange`) is gone. `checkToolsetReadiness` now reports the write scope of every path-scoped WRITE_LOW/WRITE_HIGH tool the policy grants, not only `fs.write` and `fs.edit`. Refusals before any byte is written are definite failures.
