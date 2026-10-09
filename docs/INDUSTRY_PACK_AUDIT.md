# Industry Pack Audit

The **Industry Pack Audit** is the paid Industry Packs deliverable: it turns a
sector diagnostic from *a score* into *an audit artifact you can hand to a
regulator, customer, or your own risk team*.

For every control in an Industry Pack the audit produces:

- **A level and a status** against the pack's own L1/L3/L5 anchors: at target
  (`PASS` in JSON), adequate or gap. Both come from self-declared answers, so the
  Markdown labels them self-reported and they are never a regulatory pass.
- **A multi-framework crosswalk** — each control is mapped to public control
  anchors in **EU AI Act**, **NIST AI RMF**, **ISO/IEC 42001**, and **SOC 2**,
  plus the sector regulation itself. One assessment lines up with several
  audits at once.
- **The evidence an auditor expects** for that control.
- **A concrete remediation for anything short of target** — a generated policy
  stub, guardrail, or evidence-collection recipe, with the pack's L3 descriptor
  as the acceptance criterion the agent must meet.

Each answer is **self-reported** (`overall.claimKind: "self_reported"`). Without
any answer the audit is a `synthetic_example` baseline, which is never signed.

A bundle written with `--audit-bundle` is **signed by the workspace auditor
key** through the same signing path as audit binders (vault, or notary when the
trust config says so). It also carries `receiptHash`, an unkeyed `sha256`
checksum: anyone who edits the file can recompute it, so the checksum alone
proves nothing about who produced the file. A bundle written with `--no-sign`
has only the checksum and says so: `checksum only — not signed`.

## Usage

The audit is part of the paid Industry Packs tier and is entitlement-gated.

```bash
# Full audit for a pack (JSON), written to a bundle signed by the workspace auditor key
amc domain apply --agent my-agent --pack clinical-trials --audit \
  --responses responses.json --audit-bundle clinical-trials.audit.json --json

# Checksum-only bundle, not signed (no vault needed)
amc domain apply --agent my-agent --pack clinical-trials --audit \
  --audit-bundle clinical-trials.audit.json --no-sign

# Auditor-ready Markdown
amc domain apply --agent my-agent --pack digital-health-record --audit

# Narrow the crosswalk to a single framework
amc domain apply --agent my-agent --pack digital-payments --audit --framework eu_ai_act

# Score against real responses instead of the L1 baseline
amc domain apply --agent my-agent --pack clinical-trials --audit \
  --responses responses.json
```

`--responses` is a JSON object of `{ "<questionId>": <level 1-5> }`. Without it
the audit runs a **baseline at L1**, which is useful on its own: it produces the
complete "here is everything you would need to prove, and the fix for each gap"
roadmap for that sector. The baseline is a `synthetic_example`, so signing it is
refused: pass `--responses` or `--no-sign`.

Signing needs the unlocked vault (`AMC_VAULT_PASSPHRASE`). If signing fails, the
command exits 1 and writes nothing:
`Cannot sign the industry-pack audit: <reason>. Unlock the vault (AMC_VAULT_PASSPHRASE) or pass --no-sign for a checksum-only bundle.`
A signed write prints:

```
Signed industry-pack audit written: clinical-trials.audit.json
  Signer: auditor key sha256:<key id> (VAULT, SOFTWARE)
  Answers: self-reported. The signature proves who produced this file and that it is unchanged, not that the answers are true.
  Verify: amc audit binder verify clinical-trials.audit.json --pubkey <recorded-auditor.pub>
```

Without `--audit-bundle`, the Markdown preview reads `Checksum only — not signed`.

`--framework` accepts `eu_ai_act`, `nist`, `iso42001`, `soc2`, or `sector`.

## Verifying a bundle

```bash
amc audit binder verify clinical-trials.audit.json --pubkey <recorded-auditor.pub>
```

`amc audit binder verify` recognises a `.json` file whose `schemaVersion` is an
industry-pack audit and checks it with the pinned issuer trust every AMC
verifier uses (see [TRUST_LIST.md](TRUST_LIST.md)): the signing key must be
pinned for `artifact-seal` by `--pubkey` or a signed trust list. The public key
inside the bundle only locates the signer; it never vouches for the bundle.
Pin the auditor public key you recorded when the vault was created, not one
taken from the bundle. On success it prints
`Industry-pack audit verified: signer sha256:<key id>, checksum ok`; otherwise
it prints each error and exits 1:

- `UNREADABLE`: the file cannot be read (no operating-system error text is shown).
- `UNSIGNED`: a checksum-only bundle (`--no-sign`, or written before signing existed).
- `CHECKSUM_MISMATCH`: `receiptHash` does not match the body.
- `DIGEST_MISMATCH` or `SIGNATURE_INVALID`: the bundle changed after signing, even if `receiptHash` was recomputed.
- An unpinned, distrusted or revoked signer key (`SIGNER_UNTRUSTED` in `--json`).

`--allow-unpinned` gives an integrity-only result with exit code 2, never a
trusted one. Studio's binder verify route (`GET /audit/binders/:id/verify`)
verifies a `?file=` only inside `.amc/audit/binders/exports/`, so copy a bundle
there to verify it from Studio (a copy, not a link). A missing file, a file
reached through a symbolic link (the file itself, or `.amc/audit`,
`.amc/audit/binders`, `exports` or a directory under it), a hard-linked file,
and anything that is not a regular file all read as the same `UNREADABLE`, and
the bytes verified are the bytes read once from that file. The checksum alone is
`sha256(canonicalize(bundle without receiptHash and signature))`; recomputing it
detects accidental edits, not deliberate ones.

## What it proves — and what it doesn't

- **A signature proves origin and integrity, not truth.** A verified bundle was
  produced by the holder of the pinned auditor key and nobody edited a control,
  verdict, or citation afterward. The answers behind it are still self-reported.
- **It does not prove your agent meets any regulation.** A bundle of L1
  controls is an honest picture of an agent with no evidence yet. The value
  is the auditable structure — controls, crosswalk, evidence, and fixes — that
  you close over time as real evidence accrues.

## Notes

- The crosswalk uses **public standard identifiers** (EU AI Act articles, NIST
  AI RMF subcategories, ISO/IEC 42001 Annex A controls, SOC 2 Trust Services
  Criteria) as indicative anchors. It is a mapping aid, not a substitute for a
  qualified assessor's judgment.
- The audit builder is pure and deterministic: the same inputs always yield the
  same checksum, so bundles are reproducible and diffable. The signature adds a
  signing time, so two signed bundles of the same inputs differ only there.
