# P1-37 automatic compaction: bounded qualification

The committed candidate adds one automatic-compaction test file against unchanged merged production source. Canonical fresh-checkout qualification passed 51/51 cases: 31 new automatic cases and 20 existing manual cases. Both required source mutations produced the intended failing assertions; exact restorations passed 51/51. This is bounded qualification. Formal P1-37, full-suite/coverage, quality, hosted merge and release acceptance remain open.

Candidate: `b8850be74eb342bb04dbc7dc3786a9393325f436`, branch `codex/p1-37-qualification`. The later metadata commit contains this packet; it does not change what the fresh checkout built. Node 22.23.3, ABI 127, pnpm 10.33.0, macOS arm64. The new test is 44,184 bytes, SHA-256 `f81a60b6b46acc37f4003bd76d384e22637225100a7b805623db540ea8bc0f48`.

| Actual invocation | Result |
| --- | --- |
| Existing manual compaction baseline, two files | 20/20; natural exit 0 |
| Disabled-loop compatibility, three selected existing files | 41/41; natural exit 0 |
| Initial v2 three-file run | 49 passed, 1 failed of 50; natural exit 1 |
| Corrected v3 three-file run | 51/51; natural exit 0 |
| Original full test typecheck | Compiler exit 2; wrapper correctly halted at 70 |
| V4 full test typecheck and three-file rerun | Compiler exit 0; 51/51 |
| Source typecheck, lint, build | Passed |
| Clean-source install/build and native smoke | Passed at the candidate commit |
| Canonical fresh Q, three files | 51/51; natural exit 0, 9,806 ms |
| M1: remove recent-step exclusion | 48 passed, 3 failed; exact restoration 51/51 |
| M2: remove v2 trigger schema field | 44 passed, 7 failed; exact restoration 51/51 |
| Freeze, final counts, docs and architecture | Passed |
| Duplicates / dead code | Failed: 1,268 / 2,729 findings; no baseline adoption |

Runs overlap; their totals are not summed. The disabled compatibility batch covers `agentLoopTurnMachine`, `agentLoopReconstructable` and `agentLoopRetry`, not every existing loop file. The count generator updated only ten published test-file inventories from 1,675 to 1,676. Those are file counts, not executed or passing case counts.

## What the finite corpus proves

The scripted adapter drives actual request encoding, AgentDriver, SessionService, SQLite events, signed settlement, compaction and product verification. Responses, usage and tool outputs are synthetic mechanism fixtures. They are not live model quality, provider authentication, measured production cost or OS containment evidence.

The tests cover measured prompt thresholds 7,000/7,999/8,000, pruning at 8,500, recent-two protection, measured byte order and stable ties, small-result retention and complete tool pairs. Recent source IDs and commitments are checked before broad counts. Receipts cite the signed measurement and source commitments; savings are payload bytes. The encrypted-spill case authenticates its signed reference before retrieving the retained object, measuring context-preview bytes rather than full-output tokens. It does not qualify the whole P0-30 spill lifecycle.

The genuine two-turn summary fixture dispatches seven requests. The extra no-tools summary request has a signed header, usage and settlement; its receipt cites exact origins and summarizer identity. Current assistant-role, self-reported fenced summaries and verbatim user messages preserve the implemented security contract. The next request contains the summary and excludes internal summarizer instructions. Subsequent usage is an observation, including an unchanged measurement, rather than a savings promise. The three-per-turn cap counts successful compaction boundaries and resets next turn. Manual v1 compatibility and replay remain covered.

Actual `verifyAgentRun`, request reconstruction and a fresh compiled `amc agent-loop verify` child pass on the canonical summary session. The child receives the literal local monitor fingerprint captured after initialization and before requests. Its seven request reconstructions match the API result. See `public-evidence.json`, complete cold stdout/stderr and the independent canonical audit.

## Preserved failures and fixture corrections

Unexecuted v1 had two inaccurate error regexes. V2 matched the actual source-commitment and byte-accounting errors before the initial run. Its one runtime failure came from expecting a successful provider finish without usage: the existing stream guard correctly rejected it with `AMC_LLM_STREAM_USAGE_MISSING`. The turn-helper assertion stopped before the intended compaction and notice assertions. Production was not weakened. The failed fixture and original raw/observer evidence remain preserved.

V3 separates two contracts. The integrated negative records one genuine failed request, incomplete/unreported usage, an error turn, no tool execution and no compaction. Verifying that history authenticates failure, not provider success. A separate case signs a manual null-usage step end and invokes public `AutoCompactor.afterStep` over real services, requiring no edits/dispatches/tools and one notice. That is class-boundary coverage, not a successful integrated usage-less provider response. Cleanup reports actual surviving roots after attempted deletion; partial cleanup can still leave only part of a fixture.

Full test typecheck then found TS2339 because `expect(ref?.v).toBe(2)` does not narrow a TypeScript union. The compiler naturally exited 2; the unchanged wrapper halted at 70. Original ACTIVE/HALTED markers, diagnostics and source snapshot remain intact. Independent zero-signal PID/group ESRCH and wrapper-delta reviews admitted a distinct namespace that still requires natural exit 0/1 and process-group absence. V4 changes only the runtime fixture guard to require v2 and a locator before reading `encodedSha256`. No cast, compiler relaxation, case removal, production change or deadline extension occurred. Its full test typecheck and runtime rerun passed.

The source typecheck's actual argv includes an explicit 8 GiB Node heap; the full argv is retained. The later successful test typecheck uses the original failed compiler arguments. No terminating signal, automatic retry or automatic source restoration was used.

## Mutation evidence and masking

M1 removes only the recent-step exclusion in `autoCompact.ts`. Its decisive body failure is the 8,500-token case at test line 286:36: a recent result's live source ID changes. Later digest, byte, receipt and verifier assertions in that body are masked. Two other bodies fail at line 267:33 on three receipts versus one and at line 323:10 on two extra recent sources in the ordered list. The original 20 manual cases pass. Restoring exact original bytes returns 51/51.

M2 removes only the required trigger schema field. The standalone complete triggerless v2 structural negative fails at line 576:69: `safeParse(...).success` is true instead of false. It has no live-producer prerequisite. Six other bodies stop earlier at the turn helper, line 134:65, because ordinary trigger-bearing producer receipts are refused as incomplete measurements; those failures do not prove their masked spill/cap/summary/replay assertions. All 20 manual cases pass. Exact restoration returns 51/51.

These are source-Vitest controls in Q. Deleting the schema field also removes its inferred TypeScript property; M2 is not claimed typechecked or build-valid. Neither mutant rebuilds or changes compiled CLI bytes, so compiled-child results are compatibility observations rather than compiled-mutant sensitivity.

## Physical binding, ownership and remaining acceptance

The fresh checkout installed and built its own native module. Its native inode 542184874 is distinct from R's 539175547; both have link count 1. Fifty-seven selected source/test/config/count pins, five compiled-reader pins and selected Node/native identities are bound and restored. The observer is frozen. The invocation explicitly uses R's Vitest entry with Q as `--root`; it is not a wholly independent Q runner. Private HOME and inherited environment are disclosed. Owned-group ESRCH proves absence at the recorded observations, not universal detached-descendant exclusion.

Independent built-in crypto validates signatures over retained event digests and checks the summary commitment/arithmetic and source/measurement/header/settlement joins. This does not independently reconstruct canonical row hashes, the complete chain, every request byte or missing source payloads. The public subset is not a full replayable database. The trust anchor is local; it is not external authorship attestation. The fresh child runs after session close, but idle parent pools may remain until cleanup, and the child receives the owned passphrase. This is not locked-vault or public-only-reader proof. Successful fixture roots were disposable; failed fixtures remain private.

The freeze remains 1,236 CLI command and inventory paths, 41 station packs and 632 questions. Duplicate summary bytes match the previous qualification. Dead-code findings drop from 2,730 to 2,729 only because this test references `surfaceCompactionReceiptSchema`; none were added, and that change is not production integration. Architecture's suggested ratchet lowering was not applied. Freeze, coverage, source-quality and test guards remain unchanged.

D15 reported no snapshot need for the test, generated counts and new receipt folder. The receipt folder was absent in 169 actual trees; the initial 163-tree test observation is supplemented by six historical Xirp absences. All 13 open PRs and 30 changed paths were read; verified Dependabot PRs are excluded only from WIP, with zero scope overlaps including bots. The private-HOME GitHub authentication refusal is retained; the successful read-only metadata query used normal operator GitHub configuration, separate from AMC runtime isolation. Ordinary staging returned an ignored-parent diagnostic but had staged exactly the eleven reviewed files, including already tracked internal docs. Root verified every staged blob before ordinary commit; no force-add or no-verify was used.

No source/helper/CLI/guard/baseline/Claude fixture was edited. Current merged docs and the existing feature changeset are preserved; the test-only delta needs no new release claim. Full run/chat option threading, ACP/SDK propagation, summary budget refusal, JSONL and all-provider token semantics are not runtime-qualified by this corpus. Full suite and coverage were not rerun at this candidate; historical failures are not republished as current counts. Node24/Linux, hosted CI/PR/merge/release, formal Done and downstream readiness remain open. P0-30/P0-32 readiness, quality debt, human/paused decisions, Claude reservations and the F37 skip are unchanged.
