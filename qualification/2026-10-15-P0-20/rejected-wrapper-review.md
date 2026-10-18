# P0-20 audit CLI source review

One actionable finding in candidate auditCli.ts SHA256 4e646870a7f58245e9e517c130571e66b09ad0c89f693c1fb75be8a11b91c1a5.

The wrapper adds canonical self-reported claim fields to industry verification JSON, preserving verification and trust fields. However, withClaimFields also sets the internal labelled marker before anything is printed. The existing industry CLI branch calls finishVerify without opts.claim; its text renderer therefore emits the verdict and details with no Claim line. The marker suppresses postAction’s strict exit70 anyway. This masks the original successful-text labelling failure. The repair must emit the actual canonical text label, and the trusted-text fixture must assert that line in stdout. Its current signer-detail assertion cannot detect the missing label.

The first actual text/JSON results are retained and both exit70 despite valid signatures, checksums and a trusted report. No fresh runtime was performed and no repaired GREEN result is claimed.

The diff is confined to auditCli.ts (one import and the existing verify wrapper); ordinary binder output retains its original branch. Signature, issuer admission, cryptographic code, core industry producer, shared CLI, registry, Studio, export, signer and guards remain unchanged. auditCli grows from249 to253 architecture-counted lines under800. CLI and Studio retain their exact zero-headroom bytes. Freeze remains active at1236/1236 commands,41packs and632questions with no P0-20 exception. Guard and manifest hashes match the earlier preflight; normal root checks remain required.

Current human serial qualification/fix authorization supplies the demonstrated narrow repair basis. Historical merges, no matching frozen row, helper-none, absence and idleness do not supply ownership clearance. RESERVATIONS.md’s broad non-E17/non-Codex reservation and protected shared CLI coordination rule remain relevant. The held P1-78 export-request initiator changes are disjoint and must stay separately preserved. This read-only review grants no source release or Done approval.

Only source/retained evidence reads and this private receipt occurred. No product execution, live dist read, source/archive/ref edit or guard mutation occurred.
