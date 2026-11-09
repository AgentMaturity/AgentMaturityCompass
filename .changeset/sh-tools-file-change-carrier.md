---
"agent-maturity-compass": patch
---

File-change evidence is carried on the tool outcome (SH-TOOLS-06c): `fs.write`, `fs.edit` and `apply_patch` declare `fileChanges` on their result, the pipeline copies it to the outcome, and `toolEvidenceFor` writes `fileChanges` (every file written or deleted; `afterSha256` is null for a deletion) into the audit payload and `fileChange` (the first entry's path and `beforeSha256`) into the audit meta, where the resume rules read it; the other digests stay out of plain metadata. The earlier token-keyed side channel (`noteFileChange`) is gone. `checkToolsetReadiness` now reports the write scope of every path-scoped WRITE_LOW/WRITE_HIGH tool the policy grants, not only `fs.write` and `fs.edit`. Refusals before any byte is written are definite failures, including a path refusal or a read that fails for any reason but absence. `apply_patch` refuses, before writing, a patch whose evidence row would exceed the signed per-event payload cap.
