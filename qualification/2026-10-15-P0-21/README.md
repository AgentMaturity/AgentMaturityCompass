# P0-21 bounded qualification

The unchanged original core passes **37/37** on source `f58d88d80ab490490184354cc8665631d6999cc1`, with production code equivalent to `58e91dcef111bf02f773dcbfd1921d428cf75e34`. Separate unchanged runs pass **14/14 CLI** and **48/48 scoring-consumer** cases. These are three invocations, not one 99-case run. The primary receipt count is the original core 37.

Six private controls repeat the same 37-case corpus across 18 phases: **666 repeated executions, 655 passes and 11 body assertion failures across 10 distinct file/title pairs**, with zero pending/todo cases. All baseline and restored phases pass 37. Controller-v3 is the executed hash-released controller; v1/v2 remain superseded unexecuted preparation. Generic nonzero exits are not guard kills.

| Control | Baseline passed | Mutant passed / failed | Restored passed |
| --- | ---: | ---: | ---: |
| P021-C1-likert-origin | 37 | 35 / 2 | 37 |
| P021-C2-L2-threshold | 37 | 36 / 1 | 37 |
| P021-C3-numeric-self-eligible-cap | 37 | 34 / 3 | 37 |
| P021-C4-base-L3-self-tier | 37 | 36 / 1 | 37 |
| P021-C5-default-gate-self-tier | 37 | 36 / 1 | 37 |
| P021-C6-representative-raw-size | 37 | 34 / 3 | 37 |

C1 changes the Likert origin: answer 1 actually returns 20 rather than expected 0. C1/C6 also produce actual domainScore 60 rather than expected 50 after the baseScore 60 assertion passes; later assertions can be masked. C2 returns level 1 at percent 30 where the existing table expects 2. C3 exposes eligibleLevel 5 instead of 1 at three existing pack/audit assertions while other regulated-result gates remain. C4 measures policy-array sensitivity only: existing evidence rewriting and provenance maps still block attained L3, so this is not observed unsafe L3 promotion. C5 measures the direct default-gate helper with hand-shaped events. C6 is a representative two-site historical size regression: raw 6/80 cease throwing and the valid-domain result becomes 60 rather than 50. The per-answer formula is not a directly measured final aggregate 6% result. Exact failure bodies and first frames remain in copied raw/observer/classification evidence.

The core uses mocked MCP entitlement/transport and hand-shaped diagnostic evidence. CLI 14 invokes the actual built entrypoint against locally authored run JSON, not authenticated stored results. Canned MCP capabilities and counters remain fixture data. Current OBSERVED-supported L2 and audit schema /3 are preserved; no earlier policy is silently restored and no expert/legal/compliance authority follows.

The original lane inherits its parent environment with a private HOME and Node PATH; it is not a credential-free allowlist. The separate causal lane is an owned physical filesystem copy without .git and borrows unchanged parent dependencies. Its seven-key environment, private HOME/TMPDIR and owned-group signal-zero ESRCH observations do not prove OS/network isolation, all-cache absence or universal descendant absence. The observer runs before global teardown; complete streams and actual process exits are separately retained. No termination signals, compiler, import rewrite, dist mutation or original assertion/config/deadline change formed these controls.

Final evidence preserves all 7,945 original tracked files, 4,529 compiled files, the 12,474-file private copy, native identity and pinned helpers/plan/reservations. Deliberate private TS mutations restored exactly. Private homes/stores/tmp, source closures, dependency/native bodies and the 3,978,574-byte physical manifest are not copied; the manifest stays private by exact hash reference. Raw EOF whitespace is retained.

The unchanged strict no-fabrication guard passes with zero pending entries. The literal certification-word inventory remains 20 lines: 10 inside explicit permanent R4 files and 10 outside. Different scanning domains mean the guard pass does not close literal acceptance reconciliation. Required **1,269 duplicate findings and 2,751 dead-code findings** remain failed and unwaived. Prior exact-code type/lint/clean-source/quality evidence retains its original source and command attribution; it is not a new P021 execution.

The independent actual review and root outcome are copied unchanged. The root command journal has 15 actual all-zero rows; the 18 causal process records remain separate in outcomes.json. Formal P0-21 acceptance stays open. Earlier skips, strict ISO/expert gaps, two empty arrays, held API/Studio/issuer/formal failures, shared-path proposals, held P0-30 runner/full-batch/installed-pack gaps, Claude reservations and pending transfers remain unresolved. Full suite, coverage, Node24, hosted CI, PR/merge, release, formal dependencies, G0 and Done are not established. P0-45 remains read-only next-lane preparation.
