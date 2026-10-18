# P0-51 export file-link regression — 14 October 2026

The defect is reproduced on measured source `3b08f2285a9b276e3aa0fce8f36ed2f6198adb46` with v22.23.3. The focused command exits 1: 3 tests ran, 1 passed and 2 failed, with zero pending or todo tests. No production repair was made.

The new test uses only fresh temporary roots, `initWorkspace`, an actual signed transparency log entry and `exportTransparencyProofBundle`. It records the fixture operator’s auditor pin before export and verifies each normal archive with that independent pin. Four regular controls passed, including an ordinary caller-chosen file in a fixture-owned sibling directory, which preserves the existing public `outFile` contract.

The linked-directory and linked-filename cases both returned success and changed their fixture-owned target bytes. Each case ran its successful signed export control first. The sentinel had 32/31 bytes before the calls and 1686/1693 bytes afterward. The link objects and current signed-root hashes remained unchanged. Both refusal assertions and both untouched-target assertions failed. These are write-path failures after genuine setup, not parser or missing-issuer failures.

Complete raw Vitest JSON, the Node22 wrapper log, benign sentinel bytes before and after, public proof archives and per-case effect records are retained under `/private/tmp/p0-51-export-links-red-jbn2qtna`. The compact JSON receipt contains exact input and artifact hashes. The test removed only its own freshly created roots after capturing those records. No user files, other worktrees, external destinations, networks or production services were accessed.

The only authored checkout file is `tests/transparencyProofExportContainment.test.ts`. Original production inputs are unchanged relative to the recorded RED inputs. No API, Studio, CLI, archive baseline, coverage floor, dependency or freeze changes were made.

This receipt establishes local Node22/macOS behavior only. It does not establish a repair, race resistance, cross-platform behavior, hosted CI or complete P0-51 acceptance. Production scope and original restoration policy remain for root review before any repair.
