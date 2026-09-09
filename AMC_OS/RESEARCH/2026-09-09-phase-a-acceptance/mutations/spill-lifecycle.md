# AMC-1547 spill mutation execution protocol

Prepared 2026-09-09 against source `d9d55034b1e856513eea1c68b09e50ecd433063e`. This document and `spill-lifecycle.py` are **authored, unexecuted preparation**, not a receipt. The helper has not been imported, compiled or run. No baseline, mutation, installation, test, build, key operation or source acceptance occurred during authoring.

AMC-1547 blocks AMC-1522 and is related to AMC-1531 in the root ownership manifest. Its affected surfaces are native session evidence, Vault, Comply, retention and portable evidence bundles. The buyer outcome is that retained tool output remains attributable and confidential, and cannot silently escape lifecycle controls or appear complete when bytes are unavailable.

## Execution boundary

Root reviews and integrates the helper, completes the source batch, then supplies the **full final candidate SHA** explicitly. The authoring base is provenance only and is never an implicit execution target. Changed source anchors or test titles cause refusal; do not auto-update them or call such refusal a killed mutant.

Run from a trusted terminal with an existing Python 3 interpreter, an explicitly selected Node 22 executable, and the installed pnpm JavaScript entry matching the candidate's `packageManager`. The helper does not download a Node runtime or use an operator's existing checkout/install as qualification. `--repository` is an existing local repository used only as clone source.

Illustrative invocation; replace every placeholder deliberately and choose a previously unused output path:

```text
python3 /absolute/path/to/spill-lifecycle.py \
  --repository /Users/sid/AgentMaturityCompass \
  --source FULL_LOWERCASE_40_CHARACTER_FINAL_CANDIDATE_SHA \
  --output /private/tmp/amc-spill-mutations-UNIQUE_RUN_ID \
  --node /absolute/path/to/node22/bin/node \
  --pnpm /absolute/path/to/pnpm/bin/pnpm.cjs
```

`--output` must have an existing parent and must be outside the source repository and shared root. It must not already exist, even after a failed prior attempt. The helper creates a private directory containing its new clone, isolated empty pnpm store/cache, synthetic fixture temporary directory, isolated HOME, and receipts. It uses `git clone --no-local --no-hardlinks --no-checkout`, then detached checkout of the full SHA. It rejects linked Git storage/alternates, validates tracked source bytes against that commit, and refuses nonstandard index flags. It never resets, stashes, cleans or modifies the source repository.

The selected Node runtime drives both pnpm and Vitest; a private launcher keeps lifecycle subprocesses on the same Node/pnpm selections. The helper checks Node 22 and the exact pinned pnpm version, then performs a real `install --frozen-lockfile` in the new clone. Lifecycle scripts remain enabled and their output is retained. An installation failure stops qualification and preserves its logs. Source/lockfile modifications by installation also stop the run.

Child environments inherit no provider credentials, production vault passphrase, user npmrc, Git overrides, proxy settings, `NODE_OPTIONS`, notary configuration or agent endpoints. Tests create their existing synthetic temporary fixtures. No real-provider calls, production keys, remote erasures or human study observations are part of this protocol. This environment isolation is not an OS network sandbox.

## Baselines and classification

The initial and restored baselines run the complete source files `sessionSpillCommitment.test.ts`, `sessionSpill.test.ts`, `spillEncryption.test.ts`, `spillLifecycle.test.ts`, `retentionSpill.test.ts` and `bundleSpill.test.ts`, serially with a single Vitest worker. Their results are a focused source boundary, never a full repository suite, package qualification, platform matrix or release result. Every selected mutation case must appear exactly once and pass in the baseline before any mutation is admitted.

Each mutation records exact original/mutated bytes, hashes, unified patch and case names. It applies only inside the owned clone and restores the original bytes before another mutation. Unexpected concurrent edits are preserved and stop subsequent work. Tracked checkout cleanliness is checked after restoration and during final cleanup. Tests and production source are never rewritten to obtain a desired result.

Unconfirmed process-group cleanup is an immediate fail-stop exception to normal restoration. The runner first preserves the raw report bytes it observed, parsed result, process record and observed stdout/stderr snapshots, then refuses **all further subprocesses**, including restored baselines, later mutants and final Git metadata commands. A clone mutation remains in place with its original byte backup when the old process may still be using it. The final summary is incomplete, with restoration/baseline qualification and final cleanliness withheld; root must inspect the private clone and process state before any recovery. Original child-owned logs may continue changing, so failure snapshots and manifest hashes are labeled as observations rather than final immutable child output. No successful cleanup or acceptance is inferred.

The Vitest JSON report determines classification. `named-assertions-red-review-required` requires the exact selected cases to fail, exit code 1, an `AssertionError`, and a stack location inside each corresponding authored test body. Missing reports, skipped/mis-selected cases, suite errors, timeouts, unhandled errors, setup/import/teardown failures, and mixed pass/fail selections are inconclusive. A mutation that passes is `survived`. Strict classification can conservatively reject a useful failure if a future Vitest reporter changes its stack format; inspect the preserved report and correct the helper explicitly, not the receipt.

An assertion failure is **not automatically a killed security mutation**. Root must read each original patch, named assertion and failure cause, confirm the intended property was broken, confirm restoration and the restored baseline, then write a separate dated review receipt. Even an exit code 0 from this helper means only that named assertions went red with the required structure and both baselines were green; the status still requires review. Existing guards may legitimately make a mutant survive. Preserve that result and explain it.

## Source-specific mutation map

The machine-readable `MUTATIONS` list carries exact anchors and exact test names. Its source selection is based on the integrated implementations and the storage, lifecycle and native-session worker handoffs, not generated mutation guesses.

| Mutant | Production boundary | Expected discriminator |
|---|---|---|
| `publish-before-signed-commitment` | `spillPolicy.ts`: move actual persist ahead of the callback, removing the later duplicate persist | Real SessionEventStore admission interceptor observes a file before commitment admission completes |
| `swallow-commitment-admission-failure` | `spillPolicy.ts`: swallow callback failure | Both before-admission and committed-but-return-lost faults must throw and leave no retained object/result |
| `publish-raw-plaintext` | `spillStore.ts`: publish captured plaintext instead of ciphertext | Actual file contains the private fixture bytes; raw-byte exclusion precedes later reader guards |
| `invent-fallback-spill-key` | `spillEncryption.ts`: substitute a usable fixed synthetic key on writer-key failure | Missing current-key signature must produce an unretained native result, not a successfully encrypted object under a fallback key |
| `trust-unsigned-spill-policy` | `spillEncryption.ts`: bypass the whole policy signature admission boundary | Missing signature must prevent preparation despite valid YAML and an otherwise available fixture key |
| `ignore-signed-row-hash` | `spillEvidence.ts`: omit row-hash recomputation enforcement | Same-session donor ciphertext matches the forged ref; original monitor signature remains valid for the unchanged stored hash |
| `ignore-monitor-row-signature` | `spillEvidence.ts`: omit monitor signature enforcement | Same-session donor ciphertext and recomputed event hash match, isolating the invalid old signature |
| `ignore-signed-ciphertext-digest` | `spillEncryption.ts`: omit encoded digest comparison | Keyless verification must refuse changed ciphertext despite a genuinely re-signed outer manifest |
| `erase-partial-reference-scope` | `spillLifecycle.ts`: omit all-referencing-events admission | Selecting only result must fail before unlink while its commitment is outside scope |
| `sign-erasure-intention-after-unlink` | `spillLifecycle.ts`: relocate intention after removal loop | Actual removal wrapper observes absent intention; resulting failed removal makes the test's success assertion red |
| `swallow-final-erasure-audit-failure` | `spillLifecycle.ts`: swallow only final signing failure | An actual unlink has happened, but the required final-audit refusal must still escape |
| `retain-no-closed-session-gate` | `retentionEngine.ts`: discard closed-session admission as a whole | An old active session must retain bytes despite old/pruned result eligibility |
| `ignore-last-close-age` | `retentionEngine.ts`: keep close/signature checks but omit close age | Old result with a recent signed close must retain its object |
| `trust-index-reference-for-restore` | `spillLifecycle.ts`: accept index ref and use it as publisher authority | Internally consistent forged index/ciphertext and re-signed outer bundle must still fail against destination signed rows |
| `claim-complete-despite-spill-gaps` | `bundle.ts`: omit gap condition from completeness | Explicit missing/legacy entries must keep objectsComplete false |

Two boundaries deliberately need cohesive edits. Removing only unsigned-policy digest verification still leaves missing-signature-file refusal. Removing only index-ref equality still leaves the publisher validating the original destination signed ref. The corresponding mutations alter each full authority decision rather than claiming an unchanged downstream refusal validates the removed guard. These are explicitly coupled mutants, not independent proof for each changed line.

The erasure ordering case wraps the actual removal helper with an observation assertion. With the ordering mutation that observation fails before the wrapped unlink runs; lifecycle catches it as a removal failure and the outer test asserts success. Root must confirm this exact causal chain. It demonstrates removal-entry order, not a completed unaudited erasure in that mutated run. The baseline still exercises real unlink and signed outcome persistence.

## Runtime and receipt preservation

Defaults are configuration, not measured durations: each test invocation is bounded by 600 seconds, install by 1800 seconds, and overall work by 14400 seconds. CLI limits cap test timeout at 1200 seconds, install at 3600 seconds and total work at 43200 seconds. Final source-state metadata gets a separate bounded cleanup allowance; no further tests/install run under that allowance. Each child starts in a separate process group. Normal exit, timeout and interruption all reap that group, with TERM then KILL when necessary, recording whether closure was confirmed. Repeated SIGINT/SIGTERM after the first interruption cannot interrupt source restoration and receipt finalization. Forced host termination/SIGKILL cannot be made recoverable by a Python handler.

All receipt files use exclusive creation and are written once. Each command has start metadata, raw stdout/stderr and final process/cleanup metadata. Each mutation has original/mutant bytes, patch and classification. The final summary records the exact candidate SHA, source hashes, lockfile hashes, Python/OS/architecture/Node metadata, Node/pnpm fingerprints, install provenance, classifications, source restoration and process-group closure. `receipt-manifest.json` hashes the preserved receipt files. No result is overwritten on a rerun; choose another output directory.

The clone, isolated store and any synthetic fixture leftovers remain for failure investigation. Their preservation is recorded; it is not a claim that temporary fixture cleanup succeeded. Do not discard failed baseline, install, mutant or cleanup records when starting a corrected run. This helper never deletes a clone, production data, backup or remote copy.

## Explicit deferred mutations and qualification

The following remain deferred; none is claimed executed or covered by this initial selected mutation map:

- Root `SessionService.recordToolResult` commitment callback omission: current positive interceptor accesses the absent commitment and may produce a runtime failure instead of a direct assertion; strengthen a targeted test before using that mutation as a security receipt.
- Current writer-key metadata signature alone, trust-root substitution, exact historical-key read and forbidden key regeneration. Avoid accepting a different missing-key/shape refusal as proof of signature enforcement. Fallback refusal above is a separate native boundary.
- GCM/tag verification and AAD/framing: direct decryptor mutations require retaining the intended content path without having a second plaintext hash or decoder guard mask the omitted protection.
- Signed malformed-ref classification, independently signed locator conflicts, cross-session locator binding, and row filtering before inventory. Existing authored regressions need isolated mutation selection and stack qualification.
- Initial erasure-signing failure swallowing, audit-size preflight, exact intention/outcome payload binding, and retention backlog grouping. In particular, reverting to one aggregate backlog can throw a legitimate runtime refusal from the lifecycle audit-size gate; the current backlog test must acquire an explicit assertion around the expected successful call before that failure can qualify as assertion RED.
- Missing/legacy automatic export exclusion, transport index without any destination rows, no-overwrite publication, short writes, inode replacement, symbolic/hard links, private-directory modes, and root-alias portability. Guards overlap across path resolution/read/publication; mutations must target the complete property without attributing an unrelated refusal to the removed line.
- Dry-run mutation, all-reference expiry versus signed close age, final-result admission failure after materialization, asynchronous callback refusal, and input snapshot mutation.
- CoS CLI registration/operator commands, public exports/package installation, default backup inclusion, restored archived history, platform-specific filesystem semantics, concurrent same-UID ancestor replacement, interrupted process recovery and real regulated data handling.

The root owner must also perform the standing exact-commit full suite, release gate and all required package/platform checks at the completed-batch boundary. This helper does not close AMC-1547 or AMC-1522, and it does not establish DSAR completion, erase backups/exports/remotes, prove superiority over another harness, or replace real human/provider evidence.
