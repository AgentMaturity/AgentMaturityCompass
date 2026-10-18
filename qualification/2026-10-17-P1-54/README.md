# P1-54 bounded journal helper qualification

The three-file helper cohort passed 58 cases in the working checkout and 58 in a clean checkout of source commit `b1164c97420a4b11393ff4ebf48be264bb164d93`. These are repeated runs of one 58-case population, not 116 distinct cases. This receipt records a bounded qualification slice; complete P1-54 acceptance and the full plan remain open.

## Source and observed execution

The local source commit on `codex/p1-54-qualification` adds `tests/toolhubJournal.test.ts` and updates 15 generated test-source-count tokens across ten tracked documents. The published inventory changes from 1,695 to 1,696 source files. Production code, existing tests, dependencies, freeze policy and quality policy are unchanged. Nothing was pushed or merged.

The new file tests selection by mode/action class, deterministic IDs from supplied workspace/intent inputs, and classification/preservation of supplied returned results through three existing public helpers. It does not open a journal, authorize or dispatch a tool, or observe an external effect. The unchanged adjacent files are `tests/toolhubPipelineTools.test.ts` and `tests/governorToolhubWorkorders.test.ts`.

Node v22.23.3, pnpm 10.33.0 and Vitest 4.1.11 ran on Darwin arm64. The unchanged process wrapper uses the retained P1-09 checkout as its working directory; that wrapper HEAD is not the tested P1-54 commit. Both test commands select their source root and three full file paths explicitly. Raw JSON, the frozen observer and closed process records support the case audit. Report array order is not execution order; per-case assertion counts and start order remain unknown. Owned process-group absence does not prove universal descendant, socket, resource or filesystem cleanup.

`check:clean-source -- --keep` cloned the committed source, installed with the frozen lockfile, built it, and passed its native signed-tool-turn and cross-process resume checks. The separate fresh Vitest command then ran the same cohort. Forty-five source/configuration/count pairs and fifteen compiled JavaScript pairs matched the working checkout; the fresh native binary had a distinct physical identity from all fifteen retained native files. This supplies no Linux result or full-suite coverage claim.

## Checks and preserved failures

Lint, source and test typechecks, build, architecture, gates, threat model, notices, docs drift, qualification and freeze checks passed. Freeze remains 1,236 CLI command/inventory paths, 41 station packs and 632 station questions. The count check first failed because of the new source file; the unchanged generator repaired only its 15 numeric tokens and the count check then passed.

The ordinary dead-code and duplicate gates remain failing with 2,712 and 1,268 findings. Complete before/after source finding arrays retain the same occurrence identities and multiplicity. No baseline, budget or finding was waived. Receipt validity does not make those quality gates pass.

The exact-path staging command returned 1 with an ignored-parent warning, while staging all eleven requested tracked/new files. All complete staged blobs and whitespace were then checked before the ordinary local commit; no retry, force or ignore change was used. A read-only provenance assertion returned 1 because it expected a newline for a detached branch; the corrected observation records Git's empty string and unchanged source. The first fresh Vitest attempt returned 1 with zero collected cases because `/var` filters differed from Vitest's resolved `/private/var` root. That failed attempt earns zero passing-case credit; the later canonical-path command selected the same physical files without changing test or runner settings. A later ignore preflight incorrectly combined `-z` with path arguments; Git exited 128 and the unchanged runner returned 70 with both stop markers retained. No receipt files were copied during that stop. All failed records remain retained privately.

## Open acceptance and held work

Formal P1-03/P1-04 completion, P1-02 authorization integration, durable journal ordering, duplicate/concurrent dispatch protection, key-before-effect and carrier propagation, effect-then-reset behavior, thrown errors, heartbeat/recovery/reconciliation, recorder and journal-transition failures, response/Studio wiring, a real effect oracle, crash/fault matrices, both operating-system receipts, mutation checks, the specified full suite, behavioral documentation and PR/merged-SHA evidence remain unqualified by this slice. The helper tests do not clear these gaps or dependent gates.

Claude's dirty and historical work is preserved. F37 stays skipped, unfixed and unqualified. P1-25 publication and the ignored D15 archive stay held. P1-01 gaps and every other explicit decision hold remain open. Dependabot is excluded only from WIP counts; its changed paths remain part of overlap review.
