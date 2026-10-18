# P0-52 read-only preflight — 14 October 2026

P0-52 is the next same-date High qualification seam after the parent closes bounded P0-51 and qualifies P0-46. Issues.md:62 marks it Agent-Doable, due 7 October with no listed dependencies, and In review: merged/untested. P0-46/P0-51/P0-52 share that priority/date; the plan has no numeric tie rule. P0-51 advanced the urgent P0-55 dependency chain, and the parent selected P0-46 next. P0-52 does not authorize parallel implementation, paused A4/P2-02 work or a GATE-G0 transition.

## Accepted work and remaining contract

PR57 merged as 7c8549c6 and the atomic/replay/ID follow-ups as 044abba1, containing 84ee7e319. All are ancestors of accepted 5ea. Eighteen inspected source/test/docs/archive paths match accepted 5ea and owned 3b08. The held federationStore has a separate getSigningKey(config-signature) change; preserve it and do not overlay it. The whole D-15 manifest has two extra predecessor rows, with no changed existing rows.

No standalone P0-52 specification or dedicated current qualification folder was recovered. The current index, actual PR57 body, accepted follow-up commit and dated pending-checks define the bounded contract. Original containment requires safe manifest/member and benchmark IDs, containment at use, inbox identity from the admitted publisher and member/envelope hashes between the two extractions. Follow-up3 requires benchmark admission before any write and a staged inbox rename;4 validates operator peerId;5 validates config orgId at write/load;6 refuses replay, older packages and unreadable prior manifests.

The current tests have real signed traversal, admitted-identity, benchmark-ID and swapped-archive controls. The integration test refuses an unpinned benchmark and checks stats count 0, but does not inspect inbox effects. No direct current regression assertions were recovered for atomic no-effects, replay/rollback/corrupt prior manifest or invalid peer/config operations. The existing unsafe legacy signed-peer fallback must remain compatible. PR57's historic suite and 13 mutations do not prove current behavior; its merged fullCI and release gate boxes remain unchecked.

## Source concerns for actual witnesses

Publisher history is checked under the current display bucket. federationSync.ts:374–375 chooses a safe peerId, otherwise a key prefix;391–447 scans only that bucket. Adding a peer for a previously list-admitted key, or an earlier alias for the same key, appears to allow the same signing publisher to replay or roll back into a new bucket. Reuse the genuine trust-list and peer constructors to reproduce this before any repair.

Destination containment is lexical at pathSafety.ts:17–24 and federationSync.ts:445–469. Existing inbox/publisher parent links are not physically admitted. A fixture-owned parent link and genuine signed regular control are needed before any broad claim that import cannot write outside its destination. Archive member link rejection does not cover a planted destination parent.

Atomicity is currently the complete inbox rename. Benchmark ingestion writes another store afterward at 471–485, so an IO refusal there may leave the complete package committed and prevent retry through the replay guard. Standalone benchmark ingest also admits one extraction and copies another at benchImport.ts:51–70. These are scope limits/source concerns, not reproduced failures or automatic approval for redesign.

## Smallest serial qualification

After P0-46's receipt, create an owned tree from its final measured source, use frozen pnpm 10.33/Node 22 with explicit binary and PATH, and run the four existing federation/benchmark/verify test files plus private-helper/plan-edit parity. Prefer extending the 323-line federationImportContainment test to reuse actual craftPackage/peerPair/operatorTrustHome fixtures, adding a controlled createdTs and follow-up 3–6 assertions. Refusal snapshots should include content hashes and link state, since its present tree helper records names only.

Exercise the actual existing CLI syntax with isolated HOME/AMC_HOME, real operator pins and no external/model transport. init/export/import have no --json flag; verify-bundle has the existing --pubkey/--json flags. Parser/help-only errors are not functional proof. Retain genuine accept controls, unknown publisher and independent inner-benchmark refusals, replay/older/newer/equal-time and cross-publisher controls. Then remove one guard per private mutation witness, confirm a causal RED and restore exact bytes. Final pinned type/lint/count/docs/architecture/clean-source/freeze/receipt checks remain required; broader full/coverage/CI/release proof remains separate.

## Ownership and freeze

No explicit P0-52/core-path reservation was found, but RESERVATIONS:1496's generic non-E17/non-Codex claim remains ambiguous. Root must resolve production ownership before repair. SharedCLI/registry/REPL, API/Studio, A4, privacy and held scopes remain protected. P0-52 has no freeze-exception key and adds no command path or content.

The existing federationStore snapshot is registered under P0-52 at base 201c76b6, and benchRegistryStore under P0-09. Both archives match their SHA/base bytes and have ancestor bases. Reuse them; never resnapshot registered files or overwrite archives. An unregistered path is not permission to bypass parity. federationSync is 510 lines against 800, Store 218, benchImport 103 and the existing test 323; no budget change is needed for bounded tests.

Graphify queried a private copy of the stale 36459-node graph, found 88/shown 29 with truncation, and left its original bytes unchanged. Current source pins support this preflight. No P0-52 modules, tests, fixtures, builds or servers executed, and no source, tracker, ref or Claude state changed. Exact hashes, references and planned commands are in the JSON companion.
