# P2-07 OIDC, persisted state and SCIM: bounded qualification

The fresh committed SCIM checkout passed 160/160 tests across six files. A source-only control that silently ignored a filtered group-member removal caused the intended role-revocation assertion to fail after HTTP 200; exact restoration passed 160/160 again. This records bounded source and execution evidence. Full P2-07 and global quality acceptance remain open.

The active source is `5d5604758d5a8cf5a519346c98318667b88059a2`, branch `codex/p2-07-scim-handler-qualification`, parent `bf3b7766e7b2e70d8e72135773a5c0e612ae013d`. It contains three SCIM handler/parser fixes, six new HTTP test families, scoped SCIM documentation and a changeset, plus ten exact source-inventory count overlays. The three production files match the preserved SCIM donor bytes. Existing tests, shared identity/router code, guards, baselines and deadlines remain unchanged. Node 22.23.3, ABI127, pnpm 10.33.0 and macOS arm64 are the observed toolchain.

The previous complete 48-file packet remains archived at metadata commit `bf3b7766e7b2e70d8e72135773a5c0e612ae013d`. All 46 non-index payloads remain byte-identical here. Its pending-state source is `b3473a9ccdd41c5a7e453bc132d2cb2c59387a82`, with historical 154-case observations and two pending-state controls. Its earlier verifier source is `2ca678025b26c74d9c7509f1e5d9f3979e2eae90`, with historical 150-case observations, fixture failure and two verifier controls; the original 25-file packet remains at metadata commit `5696f68c241e411e1d55e39319194ddd9a768988`. Only the active README and receipt indices are versioned. New flat `scim-*` artifacts hold this checkpoint. Historical evidence retains its own source identity and is not relabeled or added to the current total.

| Actual SCIM invocation | Result |
| --- | --- |
| Six new families on original production | 0 passed, 6 reached body failures; natural exit 1 |
| Initial six-file corpus with repaired source | 160/160; natural exit 0 |
| Source and full test typechecks, build and lint | Passed |
| Counts, freeze, docs drift and architecture | Passed |
| Committed clean-source clone, frozen install/build and native smoke | Passed; 49,150 ms |
| Fresh canonical six-file corpus | 160/160; natural exit 0; 11,977 ms |
| Filtered removal becomes a silent no-op | 159 passed, 1 body failure; natural exit 1; 10,916 ms |
| Exact original restored | 160/160; natural exit 0; 10,938 ms |
| Duplicate and dead-code checks | Failed: 1,268 and 2,727 findings; unwaived |

Receipt totals refer only to the single fresh canonical invocation: 128 verifier cases, 22 pre-existing identity/security cases, four persisted-state cases and six new SCIM cases. Related invocations overlap and are not summed. Every six-file phase has the same 160 unique raw/observer identities, all 28 hooks passing, no skips, and no unhandled or late diagnostics. The command records retain the actual owned PID/PGID, natural zero-signal ESRCH closure, full post-exit log and reporter hashes. Fixture observations are not additional test cases.

## SCIM behavior and control

The parser refuses malformed, empty and non-object operations, unsupported verbs and raw non-string paths using fixed errors. Omitted, empty and explicitly undefined typed paths retain their documented compatibility. User PATCH validates all operations before applying changes; booleans and case-insensitive exact true/false strings work, unsupported values and attributes refuse without partial changes. Unsupported user filters refuse instead of returning a successful empty result; supported username/externalId equality and genuine empty matches remain available.

The real HTTP deprovisioning case first proves an existing signed identity session works, then patches active to `False` and verifies both the stored disabled user and refusal of that session. Group PATCH validates paths, values and added users before changing membership or grants. Filtered removal preserves the member ID's case and revokes only that member's `SCIM_GROUP` grant; its manual `AUDITOR` grant and the survivor's `VIEWER` grant remain. Refusal tables also verify unchanged membership/grants. The fixture uses public setup APIs and signed mappings, synthetic identities, actual bearer authorization and owned loopback endpoints; it uses no raw fixture SQL, fake clock or global pool cleanup.

The six original-production failures occur at the active-state, supported-value, target-role, group-refusal, unsupported-filter and parser assertion vectors. The original group unknown-user operation returned 500 after removing SCIM grants. The original parser also exposed the synthetic unsupported-verb canary. All first failures and later masked assertions remain in the red/initial independent review. A collected observation is not credited as a reached assertion when an earlier assertion failed.

The separate causal control changes one line only in fresh Q's `src/identity/scim/scimGroups.ts`: a validated filtered remove becomes an empty add. Both PATCH and subsequent GET actually returned 200 while retaining the target member and `["AUDITOR", "VIEWER"]`. Line 336's HTTP-success assertion passed; line 337 then failed because target roles should equal `["AUDITOR"]`. Later survivor-role and complete response assertions at lines 338–339 were masked, though their snapshots had already been collected. All other 159 cases and all 28 hooks passed. This is the reached authorization-state assertion, not a transport, setup, timeout or cleanup failure.

The control used an exclusive original backup, independently reviewed helper and exact source admission. Root classified the actual failure before restoring the exact 8,432 original bytes in the same inode. Neither control nor restoration rebuilt compiled outputs. The cold pending-state child continues to use original compiled modules and receives no SCIM TypeScript-control sensitivity credit. No mutant compiler/build validity is claimed.

## Preservation and limits

Clean source S and independently cloned, installed and built Q both bind to source `5d560475`. The borrowed Vitest runner and wrapper cwd remain R at `bf3b7766`; R intentionally retains the separate held provider/config/archive candidate and an empty index. R is not substituted as the SCIM source authority. The finite binding covers 86 S/Q source pairs, 28 compiled rows, three distinct link-count-one native addons and the explicit R runner: 204 emitted physical pins. The additional 24 held-R files preserve their byte pins and remain regular and distinct, giving 228 finite identities; their original inodes were not emitted, so stored-inode equivalence is not claimed for those 24 files. S/Q are clean after restoration. Reservation, five donor pins, six historical halt markers and their closure evidence remain preserved.

All 16 public records per six-file invocation pass their applicable client/socket/router/IdP closure and environment restoration checks, including the control's one semantic body failure. The retained compiled pending child naturally exits 0, records PID absence and has empty complete streams. Private HOME, inherited environment, selected-file hashes and recorded process/group absence do not establish OS isolation, all transitive imports or universal descendant exclusion. Public records contain synthetic observations; fixture keys, tokens, vault, database and native bodies are not copied.

Freeze remains 1,236 CLI paths, 1,236 inventory paths, 41 packs and 632 questions. Duplicate findings remain 1,268 with zero new clones or duplicated lines. Dead-code findings remain 2,727, with zero additions or removals against the preceding checkpoint. Both commands actually exit 1; no baseline adoption, ratchet, coverage floor, line budget, deadline or waiver changed. Published source inventory moves from 1,678 to 1,679 test files and is not a passing-test total. Dependabot is excluded only from WIP counting; all bot and non-bot changed paths remain checked for overlap.

The provider-policy candidate, config archive and manifest staging in R remain explicitly held and uncommitted. This SCIM slice does not integrate their policy changes. Shared HTTPS/router behavior, standard SAML/library and private tenant evidence, live interoperability, and whole P2-07 acceptance require separate evidence and any applicable held decisions. Direct sparse arrays supplied to the group helper outside its HTTP parser remain a bounded caveat; the HTTP parser densifies operations and JSON cannot encode array holes. Prevalidation does not establish transactional rollback after storage or audit failures.

F37 remains skipped. All other human holds, paused work and Claude ownership remain open. No full-suite/coverage, hosted CI, PR, merge, release, global-green or full-plan completion claim follows from this packet. The next plan-ordered unheld work is P1-39 bounded qualification, beginning with its four unchanged MCP regressions.
