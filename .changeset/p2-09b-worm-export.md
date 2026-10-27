---
"agent-maturity-compass": minor
---

WORM export of signed retention segments (P2-09b, ADR 018 proposed): "WORM export designed for SEC 17a-4-style retention". `amc evidence-stores worm-export --bucket B --retain-days N` uploads each segment, manifest and signature to an S3 Object Lock bucket in compliance mode as content-addressed objects, then a signed `worm-export-index.json`. It refuses a bucket without Object Lock, HEAD-checks every object for compliance mode and a retain-until at least as late as requested, never deletes or shortens retention, and uploads nothing twice. `amc evidence-stores worm-verify` checks a downloaded export offline against a signed trust list that pins the artifact-seal key. `@aws-sdk/client-s3` is an optional peer loaded only for S3 targets. AMC makes no regulatory claim about an export.

freeze-exception: P2-09 — `amc evidence-stores worm-export` and `worm-verify` are the WORM export and offline verification the P2-09 spec asks for.
