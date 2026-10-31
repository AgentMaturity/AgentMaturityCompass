# P0-51 actual handler and native-service qualification — 14 October 2026

The bounded qualification remains unresolved. The final Node 22.23.3 run executed 97 tests: 67 passed and 30 failed, with zero pending or todo tests. Every remaining failure is a strict request-field refusal case on the reserved formal-certificate API. No production source was changed by this agent.

## Actual handler evidence

The test calls the real Merkle, formal-certificate and passport-token handlers through existing-style IncomingMessage/ServerResponse fixture capture. It tests all 15 request trust field names with both false and null on each family, for 90 cases. The Merkle and token families refuse all 60 cases with 400. All 30 formal cases return 200 instead of the required 400. The formal handler strips unknown fields through its z.object schema and never calls requestTrustOverride; its response still honestly says UNTRUSTED, valid:false, integrityValid:true and report.trusted:false. Strict refusal assertions remain RED. This is reserved core API remediation, not an issuer-trust acceptance pass.

Normal controls use genuine inputs. The signed Merkle proof verifies with an auditor key recorded before export and a separately root-signed operator list. A certificate produced by boundedModelCheck passes the local hash verifier but stays portable-untrusted through the actual handler. A genuinely locally valid HMAC token returns not_evaluated/valid:false. Caller secrets, including false and null, are refused. These calls prove three handler families only; they do not execute HTTP authentication middleware or a production network listener.

## Actual compiled native service

The actual compiled NativeTaskService spawned the actual compiled AMC CLI ACP child with a canned local stub and no tools. The fixture recorded the monitor key before the turn and admitted it through a separately root-signed operator trust list, never a workspace-self verdict. The service returned externally-anchored with 14 authenticated events. Explicit reverification after list loss returned failed/not-pinned; a fresh service instance did the same. Restoring the exact signed list restored externally-anchored; adding operator distrust returned failed/distrusted. All five observations retain the same task, session, event count and history head.

“Cold” means a fresh service instance after closing the prior service, in the same test process. Trust withdrawal was observed on explicit verify calls, not automatically on polling. The stub is a canned synthetic recording, not a model answer. No live provider, provider key, tool execution, TLS/OAuth, human participant or hosted service was involved.

## Exploratory failure and bounded correction

Attempt 1 ran 97 tests with 66 passes and 31 failures. The extra failure was native startup, before any usable turn, and supplies no native trust proof. Its child HOME was inside the governed workspace without an explicit shared checkpoint directory. The signed control journal defaults checkpoints from homedir and refuses a root inside the governed workspace. The existing publicTaskHttpFixture supplies the correct owned external checkpoint pattern.

The new fixture was adapted to use sibling operator-home and checkpoint directories outside nativeWorkspace, with the checkpoint path shared by parent and child and restored afterward. No assertion changed. Original attempt-1 test bytes were reconstructed and hash-verified against its recorded input; the exact fixture-only diff and both raw runs are retained. No ambient-checkpoint no-effects claim is made for the initial exploratory setup, and no user checkpoint cleanup was attempted. Final explicit fixture roots were owned and removed after capture; all owned services closed.

## Inputs and preservation

Both runs used checkout HEAD 3b08f2285a9b276e3aa0fce8f36ed2f6198adb46 plus root-owned uncommitted repairs. The JSON receipt therefore pins exact source, test and compiled input hashes; HEAD alone does not identify the candidate. API handlers and native service source, as well as the three compiled inputs, match across the two attempts. No old test, protected handler, CLI, dependency, archive, floor, baseline or graph was edited by this agent. No private vault/key/credential file was copied into the receipt.

Complete handler response observations, native observations, raw Vitest reports, wrapper logs, original test and fixture diff remain under /private/tmp/p0-51-server-native-z8cn4pij and /private/tmp/p0-51-server-native-aligned-fdtpib_a. The root agent may now perform the coordinated final build and review. Full tests, coverage, hosted CI, the 30 formal API refusal failures and the explicit-pin precedence conflict remain outside a passing completion claim.

## Final source and ownership addendum

Root committed the final source at d8e5168556aeea8e8c12cbc67848839824edbb48. The three API handlers, native service, admission implementation and new server test match their executed final input hashes. The five listed protected production files also match accepted main5ea. This is source correspondence; the raw compiled inputs remain those recorded during the actual runs, and no post-final-build runtime was run here.

RESERVATIONS.md:18 records earlier Claude authorship of enforceRouter/passportRouter; its wave header says that wave merged, so line18 alone is not an active-work claim. The broader recorded boundaries at285 and388 protect src/api/* and src/studio/*, and root explicitly retained those shared holds in the current task. Root reported all28 protected hashes equal accepted main. The formal-certificate refusal defect remains reserved and unmodified. The original compact JSON bytes are preserved in p0-51-server-native-qualification-before-ownership-20261014.json.
