---
"agent-maturity-compass": patch
---

Security: `amc export oscal --results <file>` refuses a results file unless a verified `CONTROL_RESULT` signature covers its exact bytes, so a forged but internally consistent results file is no longer exported as satisfied.

- **New sign kind:** `CONTROL_RESULT`, added to the signing kinds and to the trust config's sign kinds.
- **Writing:** AMC writes control results for export only through `writeSignedControlResults` (`src/catalog/evidence/signedResults.ts`), which signs the sha256 of exactly the bytes it writes, in `<file>.sig`. It is blocked in agent mode and refuses a path under `.amc/`. No CLI command writes a results file yet.
- **Export:** the results file and its `.sig` are each read once, and the results are parsed from the bytes the signature was verified over. The export refuses, writing nothing, when the `.sig` is missing or malformed, its digest does not match the file, or the signature does not verify against this workspace's auditor keys. When the operator has a trust list, the signing key must also be pinned in it for `artifact-seal`. A distrusted or revoked key is always refused.
- **Limit:** checked against the workspace's own auditor keys, the signature is a local audit trail, not portable trust. The command says whether the signer was pinned by a trust list. A signature shows who wrote the results, not that they are true.
- **Output:** `assessment-results.json` carries the signed file's sha256 as the AMC metadata prop `results-sha256`, and its remarks describe the signature check instead of the earlier "not signed" caveat. In `oscal-loss-report.json` the `results` input digest is now that file's sha256.
