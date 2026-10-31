# P0-51 read-only preflight — 14 October 2026

P0-51 can begin bounded qualification after P0-23's receipt, using existing accepted-source verifier wiring. No P0-51 implementation or runtime qualification ran here. P0-22's two failures and shared CLI/API/Studio holds remain.

The existing Graphify trust/publication slice was queried first with its own vocabulary: trust, verify, bundle, notary. It found 25 nodes and showed 24 within the 800-token budget. The graph is dated 8 September at d69d7037, built with 0.9.56; installed Graphify is 0.9.74. A private copy was queried; original graph bytes stayed unchanged. Current source pins, not graph edges, support the findings.

## Existing source and acceptance

PR 55 and P0-09 steps 10/11 require operator-held issuer pins, server-only trust, verifier reports, honest exits 0/1/2, proof/root binding and real refusal controls. The standalone durable P0-51.md is absent. The authored remaining-verifier changes, Studio context repair, unsigned API refusal and later confined read/prove changes already exist in accepted main. The two formal-certificate mock/UNTRUSTED follow-up hunks are also present in the active P0-23 test file through the reviewed predecessor slice; do not overlay the old held commit.

All 32 inspected production inputs match accepted main and the active P0-23 checkout. This is source correspondence only. No old P0-50 full report substitutes for current-head acceptance; full suite, coverage, source-quality and hosted CI remain separate obligations.

## Exact command families

Use Node22.23.3 with /opt/homebrew/opt/node@22/bin/node, a task-scoped PATH and fresh private operator HOME/AMC home. Generate genuine artifacts through existing fixture constructors; capture pins before export outside the artifact. Invoke argv arrays, not shell command substitution for JSON literals.

| Command | Existing fixture | Required distinction |
|---|---|---|
| bench registry verify --dir <dir> --json | publicBenchmarkRegistry | Pin the signed registry; carried registry.pub alone is not trust. |
| bom verify --in <bom> --sig <sig> --json | zeroKeyLeaseBudgetDriftBom | Genuine signature plus independent auditor pin; tampering still refuses. |
| notary verify-attest <bundle> --json | notaryTrust | Purpose is notary; use local software signing, not an HSM claim. |
| transparency merkle verify-proof <bundle> --json | federationComplianceIntegrationMerkle | Inclusion resolves to the admitted signed root. |
| transparency verify-bundle <bundle> --json | logChain and existing transparency fixtures | Signed log content plus admitted signer; content mutation fails. |
| domain pack verify --key <license> --json | industryPackEntitlement constructors | Ed25519 portable report is separate from legacy/HMAC activation. |
| imports verify-profile <file> --authorities <file> --original <file> --expected-digest <sha> --json | externalEvidenceProfile | Exact authority, producer/capture scope, signature and original/digest. |
| session verify-proof <file> --expect-auditor-key <sha> --json | sessionAnchorOfflineProof | Required out-of-band fingerprint; wrong-pin integrity never becomes exit 2. |
| enforce verify-certificate <JSON-argv> --json | formalVerification | An unkeyed certificate is never portable-trusted: exit 1 even when hash integrity passes. |
| passport verify-token <JSON-argv> --json | trustInterchange | HMAC demo token remains exit 1 under every allow combination. |

For actual signers, test genuine pinned acceptance, unknown embedded signer refusal, explicit integrity-only override where genuinely applicable, and distrust/revocation/wrong-purpose refusal. Exit 2 requires intact integrity and an actually used override; merely supplying an allow flag does not create trust. Preserve unkeyed/HMAC integrity assertions while refusing portable authorship. The command JSON contains exact bindings, arguments and source/test hashes.

Start with existing cliTrustFlags, verifySurfaces, admission, verifierReport and trustContext suites. Their capture/help cases are contract evidence, not real subprocess verification. Then use the existing crypto-family constructors in one new private actual CLI observer. Existing license tests cover activation/verifyLicenseKey, not the new portable report; private CLI witness coverage is needed.

For the server boundary, use actual current handlers and operator-held pins: each request trust field must be refused even when false/null. Formal API output remains valid:false, integrityValid:true, status:UNTRUSTED; Passport verify remains not_evaluated/valid:false and rejects body.secret. Current native service must fail internally consistent but unadmitted evidence, accept only an operator-admitted monitor, and withdraw its label after evidence loss. In-chat /verify delegates real agent-loop verify. Preserve the reserved Studio operator-home fixture rather than relocating it.

## F4 still has an unguarded write in source

API prove has lexical containment (cryptoRouter:287–296), and Studio selects a proofs destination (studioServer:8178 onward). The shared exporter resolves outFile, creates its parent and invokes tar -czf directly (merkleIndexStore:544–546; tarCreate:228–229). No physical-path/nonfollow write admission occurs. workspaceProofBundle's stronger descriptor and bounded read checks protect reads only. Its Linux opened-path check and macOS best-effort race limitation must remain accurately scoped.

The smallest future witness starts with a genuine signed transparency entry and a successful regular export. Then link the private proofs directory to an owned sibling containing a known sentinel. Use the same valid entry: refusal must leave the sibling/sentinel untouched. Add linked-leaf/ancestor variants and keep the regular positive control. This preflight did not run that witness. The current source must be recorded RED if it writes outside; do not treat the old open note as a passing mutation receipt.

The generic CLI/library accepts caller-chosen export destinations. Do not silently restrict that public contract while fixing request containment. Shared API/Studio edits remain held. merkleIndexStore has 787 ratchet lines against the generic 800 cap, 13 lines of headroom, and no explicit raised budget. It is absent from the current plan-edits manifest; that is not snapshot or ownership clearance. Inspect original restoration policy before any future repair.

## Additional source concern

The portable license report only locates a verifying PEM from --pubkey or the operator's license-public-key environment (industryPackEntitlement:300–310). With both absent, keys=[] fails before a trust-list signer can verify. A signed-list-only license case is therefore mandatory before claiming that advertised path works. Control the same key with an explicit PEM, then challenge actual purpose/distrust/revocation contexts. This is a source-derived concern, not a reproduced runtime failure or approved repair.

## Mutation plan and boundary

Use owned compiled-module copies with exact hashes and one fault per variant; preserve shared source and archives. Challenge issuer admission, override-not-trust, purpose/distrust, request-pins, missing-issuer refusal and signed-root binding. Each mutant must make its real refusal assertion fail while an intact accept control remains valid. Parser errors or malformed unsigned input cannot substitute for a causal witness. F4 first needs a real positive control and RED defect reproduction; only an authorized repaired guard could later support a meaningful removal mutant.

No tests, builds, AMC imports, servers, hosted calls, source edits, trackers, reservations or Claude messages occurred. Every command above is planned until the P0-23 serial boundary closes.
