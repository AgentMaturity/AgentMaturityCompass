# P0-47 acceptance integrity review — 14 October 2026

One concrete validation gap remains in accepted main: pinned compiled archives bypass base-commit ancestry validation. The original 19 routed freeze changes, package handling and historical meta-freeze remain structurally intact.

Accepted main: `5ea5e866a42acd5c8228a712e9b8c1d9f18c745c`. PR38 merge: `a54e4ec84f6f4350909ec2294b59fec176ec9172`. Read-only review; no test/build/mutation execution.

## Finding: compiled base ancestry is unchecked

validatePlanEdits admits40-hex syntax. The outer missing-base check skips only shallow clones. provenanceFailures returns on a matching compiled pin at50 before checking baseCommit ancestry at51, so the dist row passes provenance despite a false origin record.

PR38 merge note says the snapshot baseCommit must remain an ancestor of HEAD; README says baseCommit must stay an ancestor and records the commit the pinned build was taken at. D-15 records provenance by base commit. Source rows enforce this but compiled rows do not.

Evidence: `tests/planEditsManifest.test.ts:50-53` returns for a compiled pin before checking ancestry; `:73-77` does not reject missing bases in a full clone; `tests/helpers/landedSource.ts:31` checks only 40-hex syntax. `unused-code/plan-edits/README.md:31` requires the base to remain an ancestor.

Current main has two compiled rows. Both current bases are actual ancestors and both archives match every compiled pin; no existing bad archive is observed.

Run a dist-only unrelated/missing-base mutation, require failure without changing pins or snapshots, and extend ancestry enforcement to every row before the compiled/source-specific byte checks. Keep the documented shallow-only missing-commit behavior.

## Acceptance limits retained

- All 19 original routed tests keep their existing assertion and matcher structure. Only historical live freeze reads were rerouted. Archive reads and behavioral live source/import execution were not rerouted; no filesystem mock was added.
- Later accepted package handling is preserved: `80abdaf02` and `742330c5c` document and test snapshotting package.json for P0-09 exports/files changes. The four entry pins still inspect the archived entry fields. The historical PR38 refusal is superseded.
- The P0-47 meta snapshot of `tests/privateModuleHelperVisibility.test.ts` equals its exact base blob at 51f425bf, and the base is an ancestor. Its text freeze reads landed bytes; the actual current test still executes.
- All 55 manifest archives have matching hashes and valid current-main ancestor bases. All 53 source archives equal their base blobs; both dist archives equal every restoration pin. No current bad archive was found.
- Five routed files have later accepted changes for P0-09/P0-23/P0-27. Their actual behavior must be assessed by current baseline execution; this source review does not qualify those issues.
- The shallow-only missing-base skip is documented. This checkout is not shallow.

Full per-file diffs, source excerpts and 55-row provenance records: `/private/tmp/p0-47-acceptance-integrity-review-20261014.json`.
