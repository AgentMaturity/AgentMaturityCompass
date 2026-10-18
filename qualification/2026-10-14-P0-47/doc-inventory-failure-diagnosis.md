# P0-47 documentation and inventory failure diagnosis — 14 October 2026

This review covers six failed assertions at `7a81b5aa7316471e841f4ae0ea684a64c85ae4a1`. The actual full JSON reports 23,111 tests, 23,060 passes, 51 failures, zero pending and zero todo. Root reports global functions 71.96% against a 75% floor. This note does not qualify the full suite or waive any floor. No tests, builds or source edits were performed by this reviewer.

| Case | Actual suite result | Supported bounded repair |
|---|---:|---|
| compareBadgeDocs | 1/2 passed | Replace the old model-badge positive assertion with the existing positive writes compare-badge.svg beside the report assertion and negative model-compare-badge.svg assertion; leave all other current assertions/path names unchanged. |
| evidencePathsExist | 2/3 passed | Delete only the src/policy entry from knownAbsentCapabilities. Leave tests/evidencePathsExist.test.ts unchanged. |
| publicDocsArtifact | 3/4 passed | Use only the existing TypeDocOptions read and --gitRevision/--disableGit/--sourceLinkTemplate hunk. Substitute src/{path} into the configured template because current entry points share src/. Add the existing four-line source URL startsWith assertion immediately after the current serialized /blob/${revision}/ assertion. Preserve current first build variable and all surrounding checks. |
| publicDocsGraph | 5/6 passed | The existing 16 insertions/16 deletions convert 18 non-promoted local links into explicit GitHub repository source links and add only SSO_OIDC/CI to PUBLIC_DOC_IDS. Do not modify publicDocsGraph.test.ts. |
| evidenceBinding | 34/35 passed | Reuse only these five manual producer keys, extend the existing test.each manual row list by those five names, and add only these eight reviewed non-evidence labels with source-site comment. Preserve enumeration scanner, >50 count guard, exact empty-unclassified assertion and all control/trust tests. |
| llmResponsesCapabilities | 15/16 passed | Remove resolve import, private cached workspace and constructor resolve. Read this.init.session.workspace only at loadProcessorRegistrySnapshot, admitProtectedModelRequest and checkEgress use sites, with existing comments. Keep unsupported capability test untouched. |

## compareBadgeDocs

README names the real run-diff compare-badge.svg and no longer advertises unsupported model-compare-badge.svg. Current doc test still requires the old model badge. The actual CLI badge case passed (1/2).

Owner: P0-15 truthful comparison follow-up.

Retains executed CLI SVG-output probe and all other onboarding documentation checks; strengthens truthful absence of per-model badge advertising.

Bounded paths: `tests/compareBadgeDocs.test.ts`.

- Do not copy the candidate test whole file: its later docs/archive/AUDIT_50_AGENTS_BATCH5.md path is absent on main; main docs/AUDIT_50_AGENTS_BATCH5.md remains tracked.
- Do not copy CLI source: its bytes differ across versions.

## evidencePathsExist

The knownAbsentCapabilities list has 125 entries; src/policy is the sole present entry, with tracked src/policy/effectivePolicyReceipt.ts. Exactly 124 listed entries are absent. The two P0-47 archives are not the cause.

Owner: P1-12 effective-policy receipt follow-up.

The strict every-entry-absent equality, new-phantom-path script check, and shipped/referenced repointed source checks remain unchanged.

Bounded paths: `scripts/evidence-paths.json`.

- Historical candidate also removes src/ops/riskManager.ts; that path is still absent on this baseline and is not needed to fix this failure.
- Do not copy candidate repointed test list or src/score/agentProtocolSecurity.ts: current scorer bytes differ.

## publicDocsArtifact

Linked Git worktrees use a .git file; the current TypeDoc invocation supplies --gitRevision but relies on repository discovery, so reflection URLs omit the requested source revision. Current serialized-reflection revision guard failed.

Owner: P0-33 API requested-revision qualification fix.

Preserves mandatory current API build, requested revision, public symbols/exports, deterministic allowlist/source hashes, pinned renderer lockfile integrity and font checks; adds an exact repository-relative workspace.ts URL guard.

Bounded paths: `scripts/build-pages-site.mjs`, `tests/publicDocsArtifact.test.ts`.

- No D-12 opt-in/API suppression, copySpecV2, Pi TypeDoc entry, timeout, package exports, font or artifact manifest changes.
- No whole-file copy of candidate script/test/typedoc.json; all differ.

## publicDocsGraph

Exactly 20 local guide edges resolve outside PUBLIC_DOC_IDS, including two ../spec targets. Eighteen should remain repository links; CI and SSO_OIDC are existing reviewable guides to promote. The current graph test is byte-identical to both preserved checkouts.

Owner: P0-11 and P1-01/05/07/11/17/26/35/39/67, P2-07 authored documentation follow-ups.

No graph allowlist/test weakening. Source links stay accessible without pretending draft/catalog/archive/spec files are promoted guides. All local-edge, no-internal-edge, source-existence and category guards remain.

Bounded paths: `docs/CLAIM_KINDS.md`, `docs/COMPLIANCE.md`, `docs/COMPLIANCE_FRAMEWORKS.md`, `docs/IDENTITY.md`, `docs/MCP_SERVER.md`, `docs/NATIVE_MCP.md`, `docs/NATIVE_SANDBOX_UBUNTU.md`, `docs/NATIVE_STUDIO_TASKS.md`, `docs/OPEN_STANDARD.md`, `docs/SCORING_METHODOLOGY.md`, `docs/THREAT_MODEL.md`, `docs/TOOLHUB.md`, `docs/TRANSPARENCY_MERKLE.md`, `website/docs/docs.js`.

- Do not overlay the later candidate docs roster/archive migration.
- Promoting a guide does not establish qualified OIDC runtime or live deployment; current SSO_OIDC explicitly retains its unqualified/follow-up boundaries.

## evidenceBinding

Thirteen unclassified literal labels appear in current source. Five self-report-shaped labels must map to manual; eight labels name internal result envelope/registry/applicability metadata rather than ledger-event sources. Core compliance evidenceBinding.ts bytes are identical across all versions, but evidenceProvenance.ts is not.

Owner: P0-18 producer table, P0-23/P1-11 result envelopes, P1-12 policy, P1-10 catalog, P1-57/59 A4, P2-01 legal-hold metadata.

Manual mapping prevents self-report-shaped labels becoming AMC runtime proof; only reviewed metadata labels bypass producer classification. Unknown future literals still fail the exhaustive source guard.

Bounded paths: `src/claims/evidenceProvenance.ts`, `tests/compliance/evidenceBinding.test.ts`.

- Do not whitelist candidate-only workspace-key-revocations, source_unavailable or value_contract absent from this current enumeration.
- Do not merely put self-report labels in the test allowlist: that would leave production fallback as amc-runtime.

## llmResponsesCapabilities

The current LlmRuntime constructor eagerly resolves init.session.workspace. The unsupported/unknown-capability probe intentionally has no workspace, so construction throws paths[0] undefined before the capability refusal can execute. Test bytes are identical across all three heads.

Owner: P2-01 authored LLM workspace/admission follow-up; not a P0-47 snapshot adapter.

Unchanged capability probe retains no-session/readEvents/no-credentials/no-transport early-refusal assertions. Existing checkEgress.ts:105 refuses missing scope as workspace_scope_required; processorRegistry.ts:170 returns invalid/workspace_invalid, not missing. No workspace is fabricated.

Bounded paths: `src/llm/adapter/llmRuntime.ts`.

- Do not add workspace to the probe stub or invent process.cwd().
- Do not overlay later P2-02 detector or P0-59 budget/refusal changes in candidate LlmRuntime.

## Exact provenance and integrity limits

The JSON companion contains full immutable-head SHA256 comparisons, all six actual failure messages, the twenty bad graph edges, literal-source citations and the exact authored badge, graph, TypeDoc and LLM patch texts. Read-only `git apply --check` passed for the badge, graph, LLM and TypeDoc production hunks. The historical TypeDoc test hunk needs only its four additional source-URL assertions placed after the current revision assertion; its later `withApi` context must not be copied.

The LLM patch parent is byte-identical to the current source. The unchanged capability test is byte-identical across main, P0-33 and Claude. The preserved current egress and processor-registry gates refuse missing workspace scope, and the patch reads the real session workspace per use. It adds neither CLI paths nor station questions and changes no freeze or archive authority. Normal freeze checks against accepted main remain mandatory.

Whole candidate source identity does not hold for CLI, scorer, TypeDoc builder/config, evidenceProvenance or LlmRuntime; therefore no blanket overlay or whole candidate-test replacement is supported. Evidence source mappings require their production table change plus narrow tests, rather than a whitelist-only repair.

All original worktrees, archived originals, freezes, policies and tracker records remain unchanged by this review. Existing authored commits are candidate provenance, not proof of current qualification or reservation clearance. Root owns any subsequent patch application and validation.
