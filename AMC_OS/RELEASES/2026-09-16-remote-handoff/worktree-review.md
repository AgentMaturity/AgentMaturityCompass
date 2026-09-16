# AMC worktree source disposition audit

Audited HEAD: `2035b20034984aec847607879828171c93f91f03`. No repository mutations.

Read-only status, SHA1 Git blob identity against rev-list --objects, branch tree comparison, source and test diff review. Historical blob identity proves prior integration, not current product parity by itself. Named successor implementation review supplies disposition. No runtime tests run by this audit; parent release gate owns verification.

## Merge recommendation

Snapshot development edits excluding runtime/build output, preserve those snapshots in pushed ancestry, then merge reviewed superseded histories with ours strategy retaining latest root product state. Record explicit rejection of public importer rename and deliberate obsolete-file removals. No other demonstrated behavior recovery found.

## Dirty worktrees

| Worktree | Entries | Disposition | Evidence |
|---|---:|---|---|
| `domain-proof-lane` | 34 | superseded | Prototype implementation blobs are in current history; source-review feature tree exactly equals ece9624e. Current domainProof APIs add confinement, canonical manifests and binding. Do not restore outdated CLI/docs. |
| `gap-0635` | 8 | superseded | Bisheng implementation and test blobs already in history; current exports evolved. f419839a hardens live drift evidence trust. |
| `gap-0636` | 10 | superseded | HELM API/benchmark/test blobs already in history; current watch exports and f419839a evidence validation supersede draft. |
| `gap-0637` | 4 | integrated | All four development blobs already reachable from current HEAD history. |
| `gap-0638` | 12 | superseded | Current same-named test preserves PocketFlow history but checks r225 rather than obsolete r217; f419839a corrects date/version boundary. |
| `gap-0639` | 9 | superseded | Current same-named test checks r225 and additionally binds receipt methodology assurance hash; old draft would downgrade that contract. |
| `gap-0661` | 3 | superseded | Current docs/source-reviews/GAP-0661-trulens-metric-validity.md and tests/gap0661TrulensMetricValidityBoundary.test.ts replace metadata-only SourceReview test with explicit no-integration/validation-table boundary. |
| `gap-0662` | 3 | superseded | Current docs/source-reviews/GAP-0662-dspy-metric-validity.md and tests/gap0662DspyMetricValidityBoundary.test.ts retain source boundary and distinguish existing generic DSPy export. |
| `hermes-knowledge-refresh-20260713` | 1 | superseded | Committed HEAD is ancestor. Single draft knowledge file is dated July and older than current native workflows. Prior audit explicitly rejects reinstating July snapshot. |
| `admiring-gates-a751a8` | 25 | superseded | Tool-session ownership and CLI evidence recovered by f537e29e,0f07c3b6,1f19cf53,e8448405 and current tests. Shared public-copy changes are old snapshots; preserve history without overlaying latest public proof claims. |
| `interesting-haslett-d9efa9` | 14 | superseded | Delegation/spine evidence successor fixes f537e29e,0f07c3b6,1f19cf53 already in history. Current public copy supersedes duplicated older edits. |
| `stoic-faraday-20e4ee` | 4 | superseded | 2e3eac76 plus managed hook revocation repair; current tests/leaseRevocationFailClosed.test.ts covers malformed/tampered/deleted stores, hooks, bridge, router and gateway without draft fail-open initialization. |
| `sweet-merkle-71246c` | 17 | superseded | bda990ac integrates origin addressing, current src/session/surfaceCompaction.ts explicitly credits sweet-merkle and authenticates actual bytes; tests/surfaceHistoryCompaction.test.ts covers repeated origin replacement, replay, range, tool pairing. Draft caller-declared replacedBytes is less safe. Old surfaceHistoryAddressing name is absorbed into behavior suite. |
| `vigilant-merkle-2d8549` | 8 | superseded | 47141f7a implements principal propagation; 79f36cfd tests/portalAttribution.test.ts validates real persistence and roles, replacing weaker productPortalSubmitAttribution test. API/OpenAPI blobs partly identical. |
| `wf_0b845f07-2cd-4` | 16 | clean_ancestor | Only local runtime/build outputs. |
| `wf_3cc93fba-030-1` | 3 | superseded | 2eed9bee integrates scopes. studioState and test byte-identical; studioServer helper bodies moved to src/studio/agentTokenScopeGuard.ts. |
| `wf_453236ab-c47-1` | 4 | integrated | All four dirty development blobs already reachable from current HEAD history; c3c46083 integrates hooks, 97e1660b records undeclared foreign control. |
| `wf_75d332bf-2ec-15` | 16 | clean_ancestor | Only local runtime/build outputs. |
| `wf_75d332bf-2ec-16` | 12 | clean_ancestor | Only local runtime/build outputs. |
| `wf_75d332bf-2ec-5` | 12 | clean_ancestor | Only local runtime/build outputs. |
| `wf_75d332bf-2ec-6` | 12 | clean_ancestor | Only local runtime/build outputs. |
| `wf_80ecc1f0-12d-5` | 1 | superseded | Alternate hook test refers to obsolete hooks, readDelegationHookControl and DELEGATION_HOOK_CONTROL_AUDIT APIs. Current subagentHookInheritance tests exercise real child/grandchild/control absence; subagentRunner.ts lines 213-214 explicitly snapshots and freezes controls. No demonstrated missing behavior. |
| `wf_870dd21b-f1e-5` | 12 | clean_ancestor | Only local runtime/build outputs. |
| `wf_870dd21b-f1e-6` | 12 | clean_ancestor | Only local runtime/build outputs. |
| `wf_8777d01c-fc6-1` | 14 | integrated | All 14 dirty development files are byte-identical to audited current HEAD, including sessionInboxSpill tests. |
| `wf_a2e7e6c6-6fc-1` | 3 | superseded | Both source blobs byte-identical. Test difference only replaces skipIf with conditional registration and mandatory platform contract test. 910e6d97 is current implementation. |
| `wf_e54e6c35-3e3-1` | 9 | integrated | All nine dirty development blobs reachable from current HEAD history; newer inbox-spill code refines same implementation. |
| `wf_e71e93d9-c37-1` | 8 | superseded | Seven development blobs in current history. firstRunProtocol difference only conditional built-CLI registration plus mandatory first-run action contract test. d635a5e2 contains current implementation. |

## Divergent branches

- `feature/amc-1190-gbqa-metric-validity-relevance`: **exact_squash_tree**. git diff branch ece9624e is empty; ece9624e ancestor of audited HEAD.
- `codex/amc-install-persona-readiness`: **exact_squash_tree**. git diff branch 2b4e35ff is empty; 2b4e35ff ancestor of audited HEAD.
- `agent/* and cleanup/amc-source-review-2026-06-20`: **superseded_source_review_history**. Feature landed ece9624e; f419839a hardening and 68684dc8/c9ad4f00 deliberate duplicate-module deletions. Old draft exports/changesets must not restore consumed files.
- `claude/dreamy-moser-3bf7b8`: **superseded_port**. bda990ac and 822123d7 recover tsconfig.tests.json, typecheck:tests package script and CI gate. Of 248 branch paths only three plans/tests-typecheck-*.md history notes absent; source interfaces evolved.
- `claude/eager-boyd`: **superseded_port**. 8ac56e3e and 77912a55 recover TypeDoc public API staged-site generation; current typedoc.json exists.
- `claude/dreamy-heisenberg`: **partial_superseded_port**. 9923d76c replaces three duplicate report files with canonical redirects. Parent audit_stash agent recovering remaining nist/soc2 redirects.
- `claude/crazy-khorana`: **reject_breaking_rename_preserve_history**. d73f33e2 removes attribution and renames public promptfoo importer and exports to generic-eval; retain current supported API. Parent audit_stash agent recovers useful example.com PII fixture hygiene.
- `dependabot/github_actions/actions/checkout-6`: **integrated_behavior**. All nine changed workflow files currently use actions/checkout@v6.
- `codex/amc-expanded-research-5000-gaps`: **patch_equivalent**. git cherry audited HEAD branch returns - 4fde3913.

Per-file identity and reasoning: `worktree-dispositions.json`.
