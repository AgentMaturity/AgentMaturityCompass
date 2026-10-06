# Verifier inventory

Every `verify` command that the CLI registers, from `git grep -n -F 'command("verify' -- src` (72 registrations) matched to the generated [CLI command inventory](../CLI_COMMAND_INVENTORY.md). Issue P0-09 uses this list to decide which commands must refuse issuer keys that the verifier operator has not pinned.

- **Portable artifact**: the command verifies a file or bundle that may come from somewhere else, so the signing key must be pinned by `--pubkey` or a signed trust list ([TRUST_LIST.md](../TRUST_LIST.md)). A key shipped inside the artifact never vouches for it.
- **Workspace self-check**: the command checks the workspace's own signed configuration or records with keys read from that same workspace. A pass shows internal consistency only, not that an independent party vouches for the content. A workspace can sign its own configuration, so its keys never count as an independent issuer.

## Status on this branch

P0-09 PR 1 adds the trust-list format, issuer admission, the built-in distrust list and the `VerifierReportV1` shape (`agent-maturity-compass/trust`). **No command below is wired to them yet.** Until PR 2 and PR 3 land, every portable command still trusts the keys it trusted before, including keys shipped inside the artifact for the rows marked PR 2 or PR 3. The "Pinning" column states the planned change, not current behaviour.

22 of the 72 commands are portable artifact verifiers.

| Command | Description | Kind | Pinning |
|---|---|---|---|
| `amc adapters verify` | Verify adapters.yaml signature | workspace self-check | Keys come from the workspace under test; internal consistency only |
| `amc agent-loop verify` | Re-derive every model request in a session from the log and check the chains | workspace self-check | Keys come from the workspace under test; internal consistency only |
| `amc alerts verify` | (no description registered) | workspace self-check | Keys come from the workspace under test; internal consistency only |
| `amc assurance verify` | Verify assurance run determinism and signatures | workspace self-check | Keys come from the workspace under test; internal consistency only |
| `amc assurance verify-policy` | Verify assurance policy signature | workspace self-check | Keys come from the workspace under test; internal consistency only |
| `amc audit binder verify` | Verify .amcaudit file | portable artifact | PR 3 (`verifyAuditBinderFile`) |
| `amc audit map verify` | Verify builtin and active map signatures | workspace self-check | Keys come from the workspace under test; internal consistency only |
| `amc audit verify` | Verify audit workspace signatures/artifacts | workspace self-check | Keys come from the workspace under test; internal consistency only |
| `amc audit verify-policy` | Verify signed audit policy | workspace self-check | Keys come from the workspace under test; internal consistency only |
| `amc backup verify` | Verify signed backup bundle offline | portable artifact | PR 3 (`verifyBackup`) |
| `amc bench registry verify` | (no description registered) | portable artifact | Not in the P0-09 table; not yet reviewed |
| `amc bench verify` | Verify .amcbench artifact offline | portable artifact | PR 3 (`verifyBenchArtifactFile`) |
| `amc bench verify-policy` | Verify signed bench policy | workspace self-check | Keys come from the workspace under test; internal consistency only |
| `amc benchmark verify` | (no description registered) | portable artifact | PR 3 (`verifyBenchmarkArtifact`) |
| `amc blobs verify` | Verify encrypted blob index and payload integrity | workspace self-check | Keys come from the workspace under test; internal consistency only |
| `amc bom verify` | (no description registered) | portable artifact | Not in the P0-09 table; not yet reviewed |
| `amc budgets verify` | (no description registered) | workspace self-check | Keys come from the workspace under test; internal consistency only |
| `amc bundle verify` | Verify evidence bundle offline | portable artifact | PR 2 (`verifyEvidenceBundle`) |
| `amc canon verify` | Verify canonical compass content signature | workspace self-check | Keys come from the workspace under test; internal consistency only |
| `amc casebook verify` | Verify signed casebook and case files | workspace self-check | Keys come from the workspace under test; internal consistency only |
| `amc cert verify` | Verify any AMC certificate offline (.amccert bundle or trust-certificate JSON) | portable artifact | PR 2 (`verifyCertificate`, `verifyTrustCertificateEnvelope`) |
| `amc cert verify-revocation` | Verify revocation file signature | portable artifact | PR 2 (`verifyRevocationFile`) |
| `amc cgx verify` | Verify CGX policy/graph/pack signatures | workspace self-check | Keys come from the workspace under test; internal consistency only |
| `amc compliance verify` | Verify compliance maps signature | workspace self-check | Keys come from the workspace under test; internal consistency only |
| `amc diagnostic bank verify` | Verify diagnostic bank signature | workspace self-check | Keys come from the workspace under test; internal consistency only |
| `amc domain pack verify` | Verify an Industry Packs license key | workspace self-check | Keys come from the workspace under test; internal consistency only |
| `amc enforce resources verify` | Verify the current workspace resources against an Enforce resource manifest | workspace self-check | Keys come from the workspace under test; internal consistency only |
| `amc enforce verify-certificate` | Verify the integrity of a proof certificate (pass JSON as string) | portable artifact | Not in the P0-09 table; not yet reviewed |
| `amc evidence verify` | Run full workspace verification suite | workspace self-check | Keys come from the workspace under test; internal consistency only |
| `amc federate verify` | Verify federation config signature | workspace self-check | Keys come from the workspace under test; internal consistency only |
| `amc federate verify-bundle` | Verify .amcfed package | portable artifact | PR 3 (`verifyFederationPackage`) |
| `amc forecast verify` | Verify forecast policy signature | workspace self-check | Keys come from the workspace under test; internal consistency only |
| `amc gateway verify-config` | Verify .amc/gateway.yaml signature | workspace self-check | Keys come from the workspace under test; internal consistency only |
| `amc identity verify` | Verify identity.yaml signature | workspace self-check | Keys come from the workspace under test; internal consistency only |
| `amc imports verify-profile` | Independently verify an external-evidence profile without opening a workspace | portable artifact | Already admits only operator-supplied `--authorities` |
| `amc integrations verify` | Verify integrations config signature | workspace self-check | Keys come from the workspace under test; internal consistency only |
| `amc lease verify` | (no description registered) | workspace self-check | Keys come from the workspace under test; internal consistency only |
| `amc mechanic profile verify` | (no description registered) | workspace self-check | Keys come from the workspace under test; internal consistency only |
| `amc mechanic targets verify` | (no description registered) | workspace self-check | Keys come from the workspace under test; internal consistency only |
| `amc mechanic tuning verify` | (no description registered) | workspace self-check | Keys come from the workspace under test; internal consistency only |
| `amc mechanic verify` | Verify mechanic signatures and artifacts | workspace self-check | Keys come from the workspace under test; internal consistency only |
| `amc notary verify-attest` | Verify a .amcattest bundle offline | portable artifact | Not in the P0-09 table; not yet reviewed |
| `amc ops verify` | Verify ops-policy signature | workspace self-check | Keys come from the workspace under test; internal consistency only |
| `amc org verify` | Verify signed org.yaml | workspace self-check | Keys come from the workspace under test; internal consistency only |
| `amc outcomes verify` | Verify outcome contract signature | workspace self-check | Keys come from the workspace under test; internal consistency only |
| `amc passport verify` | Verify .amcpass artifact offline | portable artifact | PR 2 (`verifyPassportArtifactFile`) |
| `amc passport verify-policy` | Verify signed passport policy | workspace self-check | Keys come from the workspace under test; internal consistency only |
| `amc passport verify-token` | Verify an AMC Trust Token (pass JSON string) | portable artifact | Not in the P0-09 table; not yet reviewed |
| `amc plugin registry verify` | Verify registry signature and package hashes | portable artifact | PR 3 (plugin registry client) |
| `amc plugin verify` | Verify plugin package signature + artifact hashes | portable artifact | PR 3 (`verifyPluginPackage`) |
| `amc policy action verify` | Verify action policy signature | workspace self-check | Keys come from the workspace under test; internal consistency only |
| `amc policy approval verify` | Verify approval-policy signature | workspace self-check | Keys come from the workspace under test; internal consistency only |
| `amc prompt pack verify` | Verify .amcprompt signature and lint signature | portable artifact | PR 3 (`verifyPromptPackFile`) |
| `amc prompt verify` | Verify prompt policy, pack, lint and scheduler signatures | workspace self-check | Keys come from the workspace under test; internal consistency only |
| `amc release verify` | Verify a .amcrelease bundle offline | portable artifact | PR 2 (`verifyReleaseBundle`) |
| `amc retention verify` | Verify archive manifests/signatures and ledger continuity | workspace self-check | Keys come from the workspace under test; internal consistency only |
| `amc session verify` | Verify the ledger and report per-session lifecycle verdicts (open / released / interrupted / closed) | workspace self-check | Ledger anchoring (step 9): fail when unanchored unless `--allow-unanchored` |
| `amc session verify-proof` | Verify a session inclusion proof offline — needs only the bundle and a pinned fingerprint | portable artifact | Already requires a pinned `--expect-auditor-key` |
| `amc standard verify` | Verify schema bundle signatures and manifest digests | workspace self-check | Keys come from the workspace under test; internal consistency only |
| `amc target verify` | Verify target profile signature | workspace self-check | Keys come from the workspace under test; internal consistency only |
| `amc ticket verify` | Verify signed execution ticket | workspace self-check | Keys come from the workspace under test; internal consistency only |
| `amc tools verify` | Verify tools.yaml signature | workspace self-check | Keys come from the workspace under test; internal consistency only |
| `amc transform verify` | Verify signed transform map | workspace self-check | Keys come from the workspace under test; internal consistency only |
| `amc transparency merkle verify-proof` | Verify signed inclusion proof bundle | portable artifact | Not in the P0-09 table; not yet reviewed |
| `amc transparency verify` | Verify transparency chain + seal signature | workspace self-check | Keys come from the workspace under test; internal consistency only |
| `amc transparency verify-bundle` | Verify exported transparency bundle | portable artifact | Not in the P0-09 table; not yet reviewed |
| `amc user verify` | Verify users.yaml signature | workspace self-check | Keys come from the workspace under test; internal consistency only |
| `amc value contract verify` | Verify value contract signature | workspace self-check | Keys come from the workspace under test; internal consistency only |
| `amc value verify` | Verify value workspace signatures/artifacts | workspace self-check | Keys come from the workspace under test; internal consistency only |
| `amc value verify-policy` | Verify signed value policy | workspace self-check | Keys come from the workspace under test; internal consistency only |
| `amc verify` | Verify integrity across AMC artifacts | workspace self-check | Ledger anchoring (step 9): fail when unanchored unless `--allow-unanchored` |
| `amc workorder verify` | Verify work order signature | workspace self-check | Keys come from the workspace under test; internal consistency only |

## Notes

- `amc verify all` (registered as `command("all")` under `amc verify`) runs the workspace checks in one pass and is a workspace self-check; its ledger check follows step 9 with `amc verify`.
- `amc assurance cert-verify` (registered as `command("cert-verify")`) verifies an assurance certificate bundle offline. It is a portable artifact verifier and is wired with `verifyAssuranceCertificateFile` in PR 2.
- The console seal check (`src/console/assets/app.js`) and the audit packet README guide are not commands; PR 3 relabels and rewrites them.
- Rows marked "not yet reviewed" verify portable inputs but were not in the P0-09 sweep. Each needs a decision (wire it in PR 3 or record why it is safe) before P0-36 lists the fixed verifiers.
