---
"agent-maturity-compass": major
---

Breaking: industry-pack audit bundles are signed with the workspace auditor key; unsigned bundles say checksum only.

- `amc domain apply --audit --audit-bundle <file>` signs the bundle with the workspace auditor key through the audit-binder signing path (vault, or notary when the trust config requires it) and prints the signer key id, that the answers are self-reported, that the signature proves who produced the file and that it is unchanged but not that the answers are true, and the verify command. It no longer prints "Signed audit bundle written" for an unkeyed checksum.
- New `--no-sign` writes a checksum-only bundle and prints `Audit bundle written: <file> (checksum only — not signed)`. When signing fails the command exits 1, writes nothing and says to unlock the vault (`AMC_VAULT_PASSPHRASE`) or pass `--no-sign`. The Markdown preview of an unsigned audit reads `Checksum only — not signed (sha256:<hash>)`.
- An audit with no answers (no `--responses`) is the L1 baseline and now carries `claimKind: "synthetic_example"`; signing it is refused, so pass `--responses` or `--no-sign`.
- The audit schema id is `amc.industry-pack-audit/3`. It adds `signature` (null when unsigned), and `receiptHash` is now computed over the audit without `receiptHash` and `signature`.
- `amc audit binder verify <file>.json` verifies an industry-pack audit through pinned issuer trust: the signer must be pinned for `artifact-seal` by `--pubkey` or a signed trust list, and the key inside the bundle never vouches for it. It exits 1 on `UNSIGNED`, `CHECKSUM_MISMATCH`, `DIGEST_MISMATCH`, `SIGNATURE_INVALID` or an untrusted signer (`SIGNER_UNTRUSTED`; exit 2 with `--allow-unpinned`), so bundles written before this release verify as unsigned. The Studio binder verify route takes the same path.
- `src/domains/industryPackAudit.ts` (not a package export) adds `signIndustryPackAudit`, `verifyIndustryPackAuditSignature`, `verifyIndustryPackAuditFile` and `verifyIndustryPackAuditChecksum`; `verifyIndustryPackAudit` remains as a deprecated alias of the checksum check.
